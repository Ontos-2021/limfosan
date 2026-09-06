import { parse as parseCookie } from 'cookie';
import {
  CommandSchema,
  GreetingSchema,
  TableCodeSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@limfosan/shared';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { AppConfig } from '../config.js';
import { loadAuth, SESSION_COOKIE } from '../auth/sessions.js';
import type { DbHandle } from '../db/index.js';
import { getFlag } from '../flags.js';
import { ManagerError, MatchManager } from './manager.js';

export type MesaSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  {
    userId: string;
    displayName: string;
    tableId?: string;
    seat?: string;
    room?: string;
  }
>;

/** Límite simple por clave para eventos de socket (una sola instancia). */
function makeSocketLimiter(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits) {
      if (value.resetAt <= now) hits.delete(key);
    }
  }, 60_000);
  timer.unref();
  return (key: string): boolean => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function originAllowed(config: AppConfig, origin: string | undefined): boolean {
  if (!origin) return true; // clientes no-navegador y pruebas
  try {
    const want = new URL(config.appUrl).host;
    return new URL(origin).host === want;
  } catch {
    return false;
  }
}

export interface RoomsHandle {
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  close: () => Promise<void>;
}

export function attachRooms(
  httpServer: HttpServer,
  config: AppConfig,
  db: DbHandle['db'],
  manager: MatchManager,
): RoomsHandle {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      path: '/socket.io/',
      cors: { origin: false }, // mismo origen: la web la sirve este backend
    },
  );
  manager.attachIo(io);

  const limitConnect = makeSocketLimiter(60_000, 60);
  const limitAction = makeSocketLimiter(60_000, 120);

  // Autenticación por cookie de sesión en el handshake (nunca por username).
  io.use(async (socket, next) => {
    try {
      if (!originAllowed(config, socket.handshake.headers.origin)) {
        next(new Error('origen no permitido'));
        return;
      }
      const ip = socket.handshake.address ?? 'unknown';
      if (!limitConnect(`conn:${ip}`)) {
        next(new Error('demasiadas conexiones'));
        return;
      }
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const sid = cookies[SESSION_COOKIE];
      if (typeof sid !== 'string' || sid.length === 0) {
        next(new Error('sin sesión'));
        return;
      }
      const auth = await loadAuth(db, sid);
      if (!auth) {
        next(new Error('sesión inválida'));
        return;
      }
      socket.data.userId = auth.user.id;
      socket.data.displayName = auth.user.displayName;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('error de autenticación'));
    }
  });

  io.on('connection', (socket: MesaSocket) => {
    const userId = socket.data.userId as string;
    const displayName = socket.data.displayName as string;

    socket.on('mesa:unirse', async (payload, ack) => {
      try {
        const parsed = TableCodeSchema.safeParse(payload?.code);
        if (!parsed.success) {
          ack({ ok: false, error: 'Código de mesa inválido.' });
          return;
        }
        const code = parsed.data;
        const match = await manager.getOrLoadByCode(code);
        const hasSeat = [...match.seats.values()].some(
          (s) => s.userId === userId,
        );
        if (!hasSeat && !(await getFlag(db, 'new_tables'))) {
          ack({
            ok: false,
            error: 'Las mesas nuevas están pausadas. Probá más tarde.',
          });
          return;
        }
        const { seat } = await manager.joinByCode(code, userId, displayName);
        const room = manager.roomFor(code);
        const previousRoom = socket.data.room as string | undefined;
        if (previousRoom && previousRoom !== room) {
          await socket.leave(previousRoom);
        }
        socket.data.tableId = match.tableId;
        socket.data.seat = seat;
        socket.data.room = room;
        await socket.join(room);
        const fresh = await manager.socketJoined(
          match.tableId,
          userId,
          socket.id,
        );
        ack({ ok: true, snapshot: manager.snapshotFor(fresh, seat) });
      } catch (err) {
        ack({
          ok: false,
          error:
            err instanceof ManagerError
              ? err.message
              : 'No se pudo unir a la mesa.',
        });
      }
    });

    socket.on('mesa:accion', async (payload, ack) => {
      try {
        const tableId = socket.data.tableId as string | undefined;
        const seat = socket.data.seat as string | undefined;
        if (!tableId || (seat !== 'p0' && seat !== 'p1')) {
          ack({ ok: false, error: 'Primero unite a una mesa.' });
          return;
        }
        // Revalida la sesión en cada acción: un baneo o expiración
        // expulsa aunque el socket siga abierto.
        const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
        const sid = cookies[SESSION_COOKIE];
        const fresh =
          typeof sid === 'string' && sid.length > 0
            ? await loadAuth(db, sid)
            : null;
        if (!fresh || fresh.user.id !== userId) {
          ack({ ok: false, error: 'Tu sesión venció. Recargá la página.' });
          socket.disconnect(true);
          return;
        }
        if (!limitAction(`act:${userId}`)) {
          ack({ ok: false, error: 'Demasiadas acciones. Esperá un momento.' });
          return;
        }
        const parsed = CommandSchema.safeParse(payload);
        if (!parsed.success) {
          ack({ ok: false, error: 'Jugada no válida. Reintentá.' });
          return;
        }
        const outcome = await manager.applyCommand(
          tableId,
          userId,
          parsed.data.commandId,
          parsed.data.action,
        );
        if (!outcome.ok) {
          ack({ ok: false, error: outcome.error ?? 'Jugada rechazada.' });
          return;
        }
        ack({ ok: true, duplicate: outcome.duplicate, seq: outcome.seq });
      } catch (err) {
        console.error(
          JSON.stringify({ msg: 'error en mesa:accion', err: String(err) }),
        );
        ack({ ok: false, error: 'Error interno. Reintentá.' });
      }
    });

    socket.on('mesa:revancha', async (ack) => {
      try {
        const tableId = socket.data.tableId as string | undefined;
        if (!tableId) {
          ack({ ok: false, error: 'Primero unite a una mesa.' });
          return;
        }
        const { newCode } = await manager.voteRematch(tableId, userId);
        ack({ ok: true });
        void newCode;
      } catch (err) {
        ack({
          ok: false,
          error:
            err instanceof ManagerError ? err.message : 'No se pudo votar.',
        });
      }
    });

    socket.on('mesa:saludo', (payload) => {
      try {
        const room = socket.data.room as string | undefined;
        if (!room) return;
        const parsed = GreetingSchema.safeParse(payload);
        if (!parsed.success) return;
        // Solo texto predefinido; se reenvía al resto de la sala.
        socket.to(room).emit('mesa:saludo', {
          from: displayName,
          text: parsed.data.text,
        });
      } catch {
        // Los saludos nunca rompen la partida.
      }
    });

    socket.on('mesa:salir', async (ack) => {
      try {
        const tableId = socket.data.tableId as string | undefined;
        const room = socket.data.room as string | undefined;
        if (tableId) {
          const status = await manager.leave(tableId, userId);
          if (status !== 'finished') {
            // En espera: no hay nada más que hacer en esa sala.
            if (room) await socket.leave(room);
            socket.data.tableId = undefined;
            socket.data.seat = undefined;
            socket.data.room = undefined;
          }
          // Si terminó (abandono), el socket se queda: puede votar revancha.
        }
        ack({ ok: true });
      } catch {
        ack({ ok: true });
      }
    });

    socket.on('disconnect', () => {
      const tableId = socket.data.tableId as string | undefined;
      if (!tableId) return;
      void manager.socketLeft(tableId, userId, socket.id).catch((err) => {
        console.error(
          JSON.stringify({ msg: 'error en disconnect', err: String(err) }),
        );
      });
    });
  });

  return {
    io,
    close: async () => {
      await io.close();
    },
  };
}
