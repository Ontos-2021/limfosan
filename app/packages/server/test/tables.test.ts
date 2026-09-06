import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Action, MatchSnapshot } from '@limfosan/shared';
import { eq } from 'drizzle-orm';
import {
  createTestStack,
  ioClient,
  request,
  truncateBetweenTests,
  type ClientSocket,
  type TestStack,
} from './helpers.js';
import { gameEvents, tables } from '../src/db/index.js';

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.close();
});

truncateBetweenTests(() => stack.handle);

interface Guest {
  userId: string;
  csrf: string;
  cookie: string;
}

async function makeGuest(displayName: string): Promise<Guest> {
  const res = await request(stack.app).post('/api/session/guest').send({
    displayName,
  });
  expect(res.status).toBe(200);
  const raw =
    (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const sid = /mesa_sid=([^;]+)/.exec(raw.join(';'))?.[1];
  if (!sid) throw new Error('sin cookie de sesión');
  return {
    userId: res.body.user.id as string,
    csrf: res.body.csrfToken as string,
    cookie: `mesa_sid=${sid}`,
  };
}

async function createTable(guest: Guest): Promise<string> {
  const res = await request(stack.app)
    .post('/api/mesas')
    .set('Cookie', guest.cookie)
    .set('x-csrf-token', guest.csrf)
    .send({});
  expect(res.status).toBe(201);
  return res.body.code as string;
}

function connect(cookie: string): ClientSocket {
  const socket = ioClient(stack.url, {
    extraHeaders: { cookie },
    transports: ['websocket', 'polling'],
  }) as ClientSocket;
  return socket;
}

function emitAck<T>(
  socket: ClientSocket,
  event: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout en ack de ${event}`)),
      10000,
    );
    const emit = socket.emit.bind(socket) as (
      ...call: unknown[]
    ) => ClientSocket;
    emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

interface Player {
  socket: ClientSocket;
  snapshots: MatchSnapshot[];
  last(): MatchSnapshot;
}

async function joinTable(guest: Guest, code: string): Promise<Player> {
  const socket = connect(guest.cookie);
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('sin conexión socket')), 10000);
  });
  const player: Player = {
    socket,
    snapshots: [],
    last() {
      const snap = this.snapshots[this.snapshots.length - 1];
      if (!snap) throw new Error('sin snapshots todavía');
      return snap;
    },
  };
  socket.on('mesa:estado', (snap: MatchSnapshot) => {
    player.snapshots.push(snap);
  });
  const ack = await emitAck<{
    ok: boolean;
    error?: string;
    snapshot?: MatchSnapshot;
  }>(socket, 'mesa:unirse', { code });
  if (!ack.ok || !ack.snapshot) {
    throw new Error(`join falló: ${ack.error ?? '?'}`);
  }
  player.snapshots.push(ack.snapshot);
  return player;
}

async function waitSeq(player: Player, seq: number): Promise<MatchSnapshot> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const last = player.snapshots[player.snapshots.length - 1];
    if (last && last.seq >= seq) return last;
    if (Date.now() > deadline) throw new Error('timeout esperando seq');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('mesas REST', () => {
  it('crear requiere sesión', async () => {
    const res = await request(stack.app).post('/api/mesas').send({});
    expect(res.status).toBe(401);
  });

  it('crea mesa y devuelve metadatos', async () => {
    const guest = await makeGuest('Anfitrión');
    const code = await createTable(guest);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const meta = await request(stack.app)
      .get(`/api/mesas/${code}`)
      .set('Cookie', guest.cookie);
    expect(meta.status).toBe(200);
    expect(meta.body.status).toBe('waiting');
    expect(meta.body.mySeat).toBe('p0');
  });

  it('el kill-switch cierra la creación', async () => {
    const guest = await makeGuest('Otro');
    // Papel de admin vía SQL directo (el flujo admin se prueba aparte).
    const { users } = await import('../src/db/index.js');
    await stack.handle.db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.id, guest.userId));
    const me = await request(stack.app)
      .get('/api/auth/me')
      .set('Cookie', guest.cookie);
    // Sin MFA no puede tocar flags.
    const noMfa = await request(stack.app)
      .post('/api/admin/flags/new_tables')
      .set('Cookie', guest.cookie)
      .set('x-csrf-token', me.body.csrfToken as string)
      .send({ enabled: false });
    expect(noMfa.status).toBe(403);
  });
});

describe('partida en línea entre dos sockets', () => {
  it('dos invitados completan una partida real', async () => {
    const a = await makeGuest('Jugadora A');
    const b = await makeGuest('Jugador B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      expect(pa.last().table.status).toBe('playing');
      expect(pb.last().me.seat).toBe('p1');

      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 2000) throw new Error('la partida no terminó');
        const snapA = pa.last();
        if (snapA.table.status === 'finished') break;
        // ¿A quién le toca? (pendiente → responde; si no, juega toPlay)
        const pending = snapA.hand.pending;
        const actor: Player = pending
          ? pending.by === snapA.me.seat
            ? pb
            : pa
          : snapA.hand.toPlay === snapA.me.seat
            ? pa
            : pb;
        const mine = actor.last();
        const allowed = mine.allowed;
        const pick =
          allowed.find((x) => x.type === 'noQuiero') ??
          allowed.find((x) => x.type === 'truco') ??
          allowed.find((x) => x.type === 'play') ??
          allowed.find((x) => x.type === 'quiero') ??
          allowed[0];
        if (!pick) throw new Error('sin acciones legales');
        const ack = await emitAck<{
          ok: boolean;
          error?: string;
          seq?: number;
        }>(actor.socket, 'mesa:accion', {
          commandId: randomUUID(),
          action: pick as Action,
        });
        expect(ack.ok, ack.error).toBe(true);
        await waitSeq(pa, (ack.seq as number) ?? 0);
        await waitSeq(pb, (ack.seq as number) ?? 0);
      }
      const finA = pa.last();
      const finB = pb.last();
      expect(finA.result).not.toBeNull();
      expect(finB.result?.winner).toBe(finA.result?.winner);
      expect(finA.result?.reason).toBe('puntos');
      expect(finA.scores[finA.result?.winner ?? 'p0']).toBeGreaterThanOrEqual(
        30,
      );
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  }, 120000);

  it('el rival nunca recibe mis cartas sin jugar', async () => {
    const a = await makeGuest('Espía A');
    const b = await makeGuest('Espía B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      // Juega una mano completa con cartas.
      let guard = 0;
      for (;;) {
        guard += 1;
        if (guard > 60) throw new Error('mano atascada');
        const snapA = pa.last();
        if (snapA.hand.handNumber > 1 || snapA.table.status === 'finished')
          break;
        const pending = snapA.hand.pending;
        const actor: Player = pending
          ? pending.by === snapA.me.seat
            ? pb
            : pa
          : snapA.hand.toPlay === snapA.me.seat
            ? pa
            : pb;
        const mine = actor.last();
        const pick =
          mine.allowed.find((x) => x.type === 'play') ??
          mine.allowed.find((x) => x.type === 'noQuiero') ??
          mine.allowed[0];
        const ack = await emitAck<{ ok: boolean; seq?: number }>(
          actor.socket,
          'mesa:accion',
          { commandId: randomUUID(), action: pick as Action },
        );
        expect(ack.ok).toBe(true);
        await waitSeq(pa, ack.seq ?? 0);
        await waitSeq(pb, ack.seq ?? 0);
      }
      // Auditoría cronológica de privacidad: cada carta de A solo puede
      // aparecer en las vistas de B después de haber sido jugada a la mesa.
      const idOf = (c: { rank: number; suit: string }): string =>
        `${c.rank}-${c.suit.slice(0, -1)}`;
      // Cartas que B legítimamente conoce: las suyas, por mano.
      const mineByHand = new Map<number, Set<string>>();
      for (const snap of pb.snapshots) {
        let set = mineByHand.get(snap.hand.handNumber);
        if (!set) {
          set = new Set<string>();
          mineByHand.set(snap.hand.handNumber, set);
        }
        for (const c of snap.hand.myCards) set.add(idOf(c));
      }
      expect(mineByHand.get(1)?.size).toBe(3);
      for (const [, set] of mineByHand) {
        expect(set.size).toBeLessThanOrEqual(3);
      }
      // Recolecta TODAS las cartas presentes en el JSON de un snapshot.
      const collectCards = (value: unknown, into: Set<string>): void => {
        if (Array.isArray(value)) {
          for (const item of value) collectCards(item, into);
        } else if (value !== null && typeof value === 'object') {
          const obj = value as Record<string, unknown>;
          if (
            typeof obj['rank'] === 'number' &&
            typeof obj['suit'] === 'string'
          ) {
            into.add(idOf(obj as { rank: number; suit: string }));
          }
          for (const key of Object.keys(obj)) collectCards(obj[key], into);
        }
      };
      const playedByHand = new Map<number, Set<string>>();
      for (const snap of pb.snapshots) {
        const hn = snap.hand.handNumber;
        let played = playedByHand.get(hn);
        if (!played) {
          played = new Set<string>();
          playedByHand.set(hn, played);
        }
        for (const p of snap.hand.played) played.add(idOf(p.card));
        const present = new Set<string>();
        collectCards(JSON.parse(JSON.stringify(snap)), present);
        const mine = mineByHand.get(hn) ?? new Set<string>();
        for (const id of present) {
          const legit = mine.has(id) || played.has(id);
          expect(
            legit,
            `carta ${id} filtrada a B sin estar jugada (seq ${snap.seq})`,
          ).toBe(true);
        }
      }
      // Y la mano inicial de A (3 cartas) existe como tal del otro lado.
      const aInitial = new Set<string>();
      for (const snap of pa.snapshots.filter((s) => s.hand.handNumber === 1)) {
        for (const c of snap.hand.myCards) aInitial.add(idOf(c));
      }
      expect(aInitial.size).toBe(3);
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  }, 120000);

  it('commandId repetido no duplica el efecto', async () => {
    const a = await makeGuest('Dup A');
    const b = await makeGuest('Dup B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      const snap = pa.last();
      const play = snap.allowed.find((x) => x.type === 'play');
      expect(play).toBeDefined();
      const commandId = randomUUID();
      const first = await emitAck<{ ok: boolean; seq?: number }>(
        pa.socket,
        'mesa:accion',
        { commandId, action: play as Action },
      );
      expect(first.ok).toBe(true);
      const second = await emitAck<{ ok: boolean; duplicate?: boolean }>(
        pa.socket,
        'mesa:accion',
        { commandId, action: play as Action },
      );
      expect(second.ok).toBe(true);
      expect(second.duplicate).toBe(true);
      const rows = await stack.handle.db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.commandId, commandId));
      expect(rows).toHaveLength(1);
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  });

  it('jugar fuera de turno es rechazado', async () => {
    const a = await makeGuest('Turno A');
    const b = await makeGuest('Turno B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      // Mano 1: sale p0 (A). B intenta jugar una carta propia igual.
      expect(pb.last().hand.toPlay).toBe('p0');
      const mine = pb.last().hand.myCards[0];
      const id = `${mine.rank}-${mine.suit.slice(0, -1)}`;
      const ack = await emitAck<{ ok: boolean; error?: string }>(
        pb.socket,
        'mesa:accion',
        { commandId: randomUUID(), action: { type: 'play', card: id } },
      );
      expect(ack.ok).toBe(false);
      expect(typeof ack.error).toBe('string');
      // Y el estado no avanzó.
      expect(pa.last().seq).toBe(0);
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  });
});

describe('recuperación ante reinicio', () => {
  it('vaciar la memoria no pierde la partida: se recarga desde Postgres', async () => {
    const a = await makeGuest('Persist A');
    const b = await makeGuest('Persist B');
    const code = await createTable(a);
    let pa = await joinTable(a, code);
    let pb = await joinTable(b, code);

    // Juegan dos cartas.
    const first = pa.last().allowed.find((x) => x.type === 'play') as Action;
    const ack1 = await emitAck<{ ok: boolean; seq?: number }>(
      pa.socket,
      'mesa:accion',
      {
        commandId: randomUUID(),
        action: first,
      },
    );
    expect(ack1.ok).toBe(true);
    await waitSeq(pa, ack1.seq ?? 0);
    await waitSeq(pb, ack1.seq ?? 0);
    const second = pb.last().allowed.find((x) => x.type === 'play') as Action;
    const ack2 = await emitAck<{ ok: boolean; seq?: number }>(
      pb.socket,
      'mesa:accion',
      {
        commandId: randomUUID(),
        action: second,
      },
    );
    expect(ack2.ok).toBe(true);
    await waitSeq(pa, ack2.seq ?? 0);
    await waitSeq(pb, ack2.seq ?? 0);

    const before = pa.last();
    pa.socket.disconnect();
    pb.socket.disconnect();

    // Simula reinicio del proceso: memoria vacía, DB intacta.
    stack.manager.clearMemoryForTests();

    pa = await joinTable(a, code);
    pb = await joinTable(b, code);
    try {
      const after = pa.last();
      expect(after.seq).toBe(before.seq);
      expect(after.scores).toEqual(before.scores);
      expect(after.hand.myCards).toEqual(before.hand.myCards);
      expect(after.hand.played).toEqual(before.hand.played);
      expect(after.hand.trickWinners).toEqual(before.hand.trickWinners);
      // Y se puede seguir jugando.
      const actor = after.hand.toPlay === after.me.seat ? pa : pb;
      const play = actor.last().allowed.find((x) => x.type === 'play');
      expect(play).toBeDefined();
      const ack = await emitAck<{ ok: boolean }>(actor.socket, 'mesa:accion', {
        commandId: randomUUID(),
        action: play as Action,
      });
      expect(ack.ok).toBe(true);
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  }, 120000);
});

describe('abandono, revancha y saludos', () => {
  it('salir a mitad de partida es abandono inmediato', async () => {
    const a = await makeGuest('Sale A');
    const b = await makeGuest('Queda B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      const done = new Promise<MatchSnapshot>((resolve) => {
        pb.socket.on('mesa:estado', (snap: MatchSnapshot) => {
          if (snap.table.status === 'finished') resolve(snap);
        });
      });
      await emitAck(pa.socket, 'mesa:salir');
      const fin = await done;
      expect(fin.result?.reason).toBe('abandono');
      expect(fin.result?.winner).toBe('p1');
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
    // Quien estaba sentado puede volver a entrar a la mesa terminada
    // (para votar la revancha); un tercero, no.
    const pa2 = await joinTable(a, code);
    expect(pa2.last().table.status).toBe('finished');
    expect(pa2.last().result?.reason).toBe('abandono');
    pa2.socket.disconnect();
    const c = await makeGuest('Fuera C');
    const pc = connect(c.cookie);
    try {
      await new Promise<void>((resolve, reject) => {
        pc.on('connect', () => resolve());
        pc.on('connect_error', (err) => reject(err));
      });
      const ack = await emitAck<{ ok: boolean; error?: string }>(
        pc,
        'mesa:unirse',
        {
          code,
        },
      );
      expect(ack.ok).toBe(false);
    } finally {
      pc.disconnect();
    }
  });

  it('la revancha crea una mesa nueva con ambos sentados', async () => {
    const a = await makeGuest('Rev A');
    const b = await makeGuest('Rev B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      await emitAck(pa.socket, 'mesa:salir');
      const codes: string[] = [];
      const both = new Promise<void>((resolve) => {
        const onCode = (payload: { code: string }) => {
          codes.push(payload.code);
          if (codes.length === 2) resolve();
        };
        pa.socket.on('mesa:revancha-lista', onCode);
        pb.socket.on('mesa:revancha-lista', onCode);
      });
      const voteA = await emitAck<{ ok: boolean; error?: string }>(
        pa.socket,
        'mesa:revancha',
      );
      expect(voteA.ok, voteA.error).toBe(true);
      const voteB = await emitAck<{ ok: boolean; error?: string }>(
        pb.socket,
        'mesa:revancha',
      );
      expect(voteB.ok, voteB.error).toBe(true);
      await both;
      expect(codes[0]).toBe(codes[1]);
      expect(codes[0]).not.toBe(code);

      const row = await stack.handle.db
        .select()
        .from(tables)
        .where(eq(tables.code, codes[0]));
      expect(row[0]?.status).toBe('playing');
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  });

  it('los saludos predefinidos llegan al rival; el texto libre no', async () => {
    const a = await makeGuest('Hola A');
    const b = await makeGuest('Hola B');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    try {
      const received: Array<{ from: string; text: string }> = [];
      pb.socket.on('mesa:saludo', (payload) => received.push(payload));
      pa.socket.emit('mesa:saludo', { text: '¡Buena mano!' });
      await new Promise((r) => setTimeout(r, 300));
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ from: 'Hola A', text: '¡Buena mano!' });
      pa.socket.emit('mesa:saludo', { text: '<script>alert(1)</script>' });
      await new Promise((r) => setTimeout(r, 300));
      expect(received).toHaveLength(1);
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
    }
  });

  it('un tercer jugador no entra (mesa llena)', async () => {
    const a = await makeGuest('Lleno A');
    const b = await makeGuest('Lleno B');
    const c = await makeGuest('Lleno C');
    const code = await createTable(a);
    const pa = await joinTable(a, code);
    const pb = await joinTable(b, code);
    const pc = connect(c.cookie);
    try {
      await new Promise<void>((resolve, reject) => {
        pc.on('connect', () => resolve());
        pc.on('connect_error', (err) => reject(err));
      });
      const ack = await emitAck<{ ok: boolean; error?: string }>(
        pc,
        'mesa:unirse',
        { code },
      );
      expect(ack.ok).toBe(false);
      expect(ack.error).toContain('dos jugadores');
    } finally {
      pa.socket.disconnect();
      pb.socket.disconnect();
      pc.disconnect();
    }
  });
});
