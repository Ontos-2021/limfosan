import { randomInt, randomUUID } from 'node:crypto';
import {
  applyAction,
  cardWeight,
  createMatch,
  EngineError,
  legalActions,
  other,
  type Action,
  type MatchState,
  type PlayerId,
} from '@limfosan/juego-truco';
import { and, eq } from 'drizzle-orm';
import type { Server as SocketServer } from 'socket.io';
import type { AppConfig } from '../config.js';
import {
  gameEvents,
  games,
  tableSeats,
  tables,
  users,
  type DbHandle,
} from '../db/index.js';
import { bumpMetric } from '../metrics.js';
import { buildSnapshot } from './views.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomTableCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export interface SeatRuntime {
  seat: PlayerId;
  userId: string;
  name: string;
  online: boolean;
  reconnects: number;
  socketIds: Set<string>;
}

export interface MatchResult {
  winner: PlayerId;
  reason: 'puntos' | 'abandono';
  bySeat: PlayerId | null;
}

export interface ActiveMatch {
  tableId: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  state: MatchState;
  version: number;
  /** Resultado final (puntos o abandono); null mientras se juega. */
  result: MatchResult | null;
  seats: Map<PlayerId, SeatRuntime>;
  rematchVotes: Set<PlayerId>;
  rematchNewCode: string | null;
  turnTimer: NodeJS.Timeout | null;
  turnDeadlineAt: number | null;
  turnKind: 'play' | 'respond' | null;
  graceTimer: NodeJS.Timeout | null;
  graceSeat: PlayerId | null;
  /** Cadena de promesas: serializa comandos por mesa (mutex). */
  chain: Promise<void>;
}

export interface CommandOutcome {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  seq?: number;
}

/**
 * Gestor autoritativo de partidas (E4).
 *
 * - El motor es pura transición; este gestor aporta identidad, persistencia,
 *   idempotencia, timers y broadcast.
 * - El estado vive en memoria para velocidad; cada transición se persiste en
 *   la misma operación (games + game_events) antes de confirmar.
 * - Ante un reinicio, las mesas se recargan perezosamente desde Postgres al
 *   reconectar el primer jugador.
 */
export class MatchManager {
  private readonly matches = new Map<string, ActiveMatch>();
  private readonly byCode = new Map<string, string>();
  private readonly loading = new Map<string, Promise<ActiveMatch>>();
  private io: SocketServer | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly db: DbHandle['db'],
  ) {}

  attachIo(io: SocketServer): void {
    this.io = io;
  }

  /* ------------------------- ciclo de vida ------------------------- */

  async createTable(
    hostUserId: string,
  ): Promise<{ tableId: string; code: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomTableCode();
      try {
        const [row] = await this.db
          .insert(tables)
          .values({ code, status: 'waiting', hostUserId })
          .returning({ id: tables.id, code: tables.code });
        await this.db.insert(tableSeats).values({
          tableId: row.id,
          seat: 'p0',
          userId: hostUserId,
        });
        await bumpMetric(this.db, 'tables_created');
        return { tableId: row.id, code: row.code };
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }
    throw new Error('No se pudo generar un código de mesa único.');
  }

  /** Une a un usuario a una mesa por código. Devuelve su asiento. */
  async joinByCode(
    code: string,
    userId: string,
    displayName: string,
  ): Promise<{ match: ActiveMatch; seat: PlayerId; rejoined: boolean }> {
    const normalized = code.trim().toUpperCase();
    const [row] = await this.db
      .select()
      .from(tables)
      .where(eq(tables.code, normalized))
      .limit(1);
    if (!row) throw new ManagerError('mesa_no_existe', 'Esa mesa no existe.');
    const match = await this.getOrLoad(row.id);

    return this.withLock(match, async () => {
      const existing = [...match.seats.values()].find(
        (s) => s.userId === userId,
      );
      // Quien ya está sentado puede volver siempre (revancha incluida).
      if (existing) {
        return { match, seat: existing.seat, rejoined: true };
      }
      if (match.status === 'finished') {
        throw new ManagerError('mesa_terminada', 'Esa partida ya terminó.');
      }
      if (match.seats.size >= 2) {
        throw new ManagerError('mesa_llena', 'La mesa ya tiene dos jugadores.');
      }
      const seat: PlayerId = match.seats.has('p0') ? 'p1' : 'p0';
      await this.db.insert(tableSeats).values({
        tableId: match.tableId,
        seat,
        userId,
      });
      match.seats.set(seat, {
        seat,
        userId,
        name: displayName,
        online: false,
        reconnects: 0,
        socketIds: new Set(),
      });
      if (match.seats.size === 2 && match.status === 'waiting') {
        await this.startMatch(match);
      }
      return { match, seat, rejoined: false };
    });
  }

  async getOrLoad(tableId: string): Promise<ActiveMatch> {
    const cached = this.matches.get(tableId);
    if (cached) return cached;
    const inflight = this.loading.get(tableId);
    if (inflight) return inflight;
    const pending = this.load(tableId).finally(() => {
      this.loading.delete(tableId);
    });
    this.loading.set(tableId, pending);
    return pending;
  }

  private async load(tableId: string): Promise<ActiveMatch> {
    const [row] = await this.db
      .select()
      .from(tables)
      .where(eq(tables.id, tableId))
      .limit(1);
    if (!row) throw new ManagerError('mesa_no_existe', 'Esa mesa no existe.');
    const seatRows = await this.db
      .select()
      .from(tableSeats)
      .where(eq(tableSeats.tableId, tableId));
    const seats = new Map<PlayerId, SeatRuntime>();
    for (const s of seatRows) {
      const [user] = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, s.userId))
        .limit(1);
      seats.set(s.seat as PlayerId, {
        seat: s.seat as PlayerId,
        userId: s.userId,
        name: user?.displayName ?? 'Jugador',
        online: false,
        reconnects: s.reconnects,
        socketIds: new Set(),
      });
    }
    let state: MatchState;
    let version = 0;
    let result: MatchResult | null = null;
    if (row.status === 'waiting') {
      // Aún sin rival: estado provisorio sin cartas (se reparte al empezar).
      state = createMatch(randomInt(1, 2147483647));
      state.hand.hands = { p0: [], p1: [] };
      state.hand.initialHands = { p0: [], p1: [] };
      version = 0;
    } else {
      const [game] = await this.db
        .select()
        .from(games)
        .where(eq(games.tableId, tableId))
        .limit(1);
      if (!game) throw new Error('Partida sin estado persistido.');
      state = game.state as MatchState;
      version = game.version;
      const stored = game.result as {
        winner?: PlayerId;
        reason?: 'puntos' | 'abandono';
        bySeat?: PlayerId | null;
      } | null;
      if (stored?.winner) {
        result = {
          winner: stored.winner,
          reason: stored.reason ?? 'puntos',
          bySeat: stored.bySeat ?? null,
        };
      } else if (state.status === 'over' && state.winner) {
        result = {
          winner: state.winner,
          reason: 'puntos',
          bySeat: state.lastEvent.by,
        };
      }
    }
    const match: ActiveMatch = {
      tableId: row.id,
      code: row.code,
      status: row.status as ActiveMatch['status'],
      state,
      version,
      result,
      seats,
      rematchVotes: new Set((row.rematchVotes as PlayerId[] | null) ?? []),
      rematchNewCode: null,
      turnTimer: null,
      turnDeadlineAt: null,
      turnKind: null,
      graceTimer: null,
      graceSeat: null,
      chain: Promise.resolve(),
    };
    const [rematchRow] = row.newTableId
      ? await this.db
          .select({ code: tables.code })
          .from(tables)
          .where(eq(tables.id, row.newTableId))
          .limit(1)
      : [];
    match.rematchNewCode = rematchRow?.code ?? null;
    this.matches.set(tableId, match);
    this.byCode.set(row.code, tableId);
    return match;
  }

  getByCode(code: string): ActiveMatch | null {
    const id = this.byCode.get(code.trim().toUpperCase());
    return id ? (this.matches.get(id) ?? null) : null;
  }

  async getOrLoadByCode(code: string): Promise<ActiveMatch> {
    const normalized = code.trim().toUpperCase();
    const cached = this.getByCode(normalized);
    if (cached) return cached;
    const [row] = await this.db
      .select({ id: tables.id })
      .from(tables)
      .where(eq(tables.code, normalized))
      .limit(1);
    if (!row) throw new ManagerError('mesa_no_existe', 'Esa mesa no existe.');
    return this.getOrLoad(row.id);
  }

  roomFor(code: string): string {
    return `mesa:${code.trim().toUpperCase()}`;
  }

  /* ------------------------- comandos ------------------------- */

  /** Ejecuta un comando de jugador con idempotencia y persistencia. */
  async applyCommand(
    tableId: string,
    userId: string,
    commandId: string,
    action: Action,
  ): Promise<CommandOutcome> {
    const match = await this.getOrLoad(tableId);
    return this.withLock(match, async () => {
      if (match.status !== 'playing') {
        return { ok: false, error: 'La partida no está en curso.' };
      }
      const seat = this.seatOf(match, userId);
      if (!seat) return { ok: false, error: 'No estás sentado en esta mesa.' };

      // Idempotencia: commandId repetido = mismo resultado, sin duplicar.
      const [existing] = await this.db
        .select({ seq: gameEvents.seq })
        .from(gameEvents)
        .where(
          and(
            eq(gameEvents.tableId, tableId),
            eq(gameEvents.commandId, commandId),
          ),
        )
        .limit(1);
      if (existing) {
        return { ok: true, duplicate: true, seq: match.version };
      }

      let next: MatchState;
      try {
        next = applyAction(match.state, seat, action);
      } catch (err) {
        if (err instanceof EngineError) {
          return { ok: false, error: this.humanize(err.code) };
        }
        throw err;
      }
      await this.persistTransition(match, {
        commandId,
        actor: seat,
        action,
        next,
        server: false,
      });
      this.afterTransition(match);
      return { ok: true, seq: match.version };
    });
  }

  /* ------------------------- presencia ------------------------- */

  async socketJoined(
    tableId: string,
    userId: string,
    socketId: string,
  ): Promise<ActiveMatch> {
    const match = await this.getOrLoad(tableId);
    return this.withLock(match, async () => {
      const seat = this.seatOf(match, userId);
      if (!seat)
        throw new ManagerError('sin_asiento', 'Sin asiento en esta mesa.');
      const runtime = match.seats.get(seat) as SeatRuntime;
      const wasOffline = !runtime.online;
      runtime.online = true;
      runtime.socketIds.add(socketId);
      await this.db
        .update(tableSeats)
        .set({ lastSeenAt: new Date(), leftAt: null })
        .where(and(eq(tableSeats.tableId, tableId), eq(tableSeats.seat, seat)));
      if (wasOffline && match.status === 'playing') {
        // Solo cuenta como "reconexión" si volvés tras dejar tu turno
        // colgado (había gracia armada): entrar por primera vez no cuenta.
        const hadGrace = match.graceSeat === seat;
        this.clearGrace(match);
        if (hadGrace) {
          runtime.reconnects += 1;
          await this.db
            .update(tableSeats)
            .set({ reconnects: runtime.reconnects })
            .where(
              and(eq(tableSeats.tableId, tableId), eq(tableSeats.seat, seat)),
            );
          if (runtime.reconnects > this.config.maxReconnects) {
            await this.forfeit(match, seat, 'demasiadas reconexiones');
            return match;
          }
        }
      }
      this.armTimers(match);
      this.broadcast(match);
      return match;
    });
  }

  async socketLeft(
    tableId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    const match = this.matches.get(tableId);
    if (!match) return;
    await this.withLock(match, async () => {
      const seat = this.seatOf(match, userId);
      if (!seat) return;
      const runtime = match.seats.get(seat) as SeatRuntime;
      runtime.socketIds.delete(socketId);
      if (runtime.socketIds.size > 0) return;
      runtime.online = false;
      await this.db
        .update(tableSeats)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(tableSeats.tableId, tableId), eq(tableSeats.seat, seat)));
      if (match.status !== 'playing') {
        this.broadcast(match);
        return;
      }
      // Si le tocaba actuar al que se fue, corre la gracia de desconexión.
      if (this.actorToMove(match) === seat) {
        this.clearTurnTimer(match);
        this.armGrace(match, seat);
      }
      this.broadcast(match);
    });
  }

  /* ------------------------- salir / revancha ------------------------- */

  /** Sale de la mesa. Si había partida en curso, es abandono. Devuelve el estado final. */
  async leave(
    tableId: string,
    userId: string,
  ): Promise<'waiting' | 'playing' | 'finished'> {
    const match = await this.getOrLoad(tableId);
    return this.withLock(match, async () => {
      const seat = this.seatOf(match, userId);
      if (!seat) return match.status;
      if (match.status === 'playing') {
        await this.forfeit(match, seat, 'abandonó la mesa');
        return match.status;
      }
      await this.db
        .update(tableSeats)
        .set({ leftAt: new Date() })
        .where(and(eq(tableSeats.tableId, tableId), eq(tableSeats.seat, seat)));
      const runtime = match.seats.get(seat);
      if (runtime) {
        runtime.online = false;
        runtime.socketIds.clear();
      }
      this.broadcast(match);
      return match.status;
    });
  }

  async voteRematch(
    tableId: string,
    userId: string,
  ): Promise<{ newCode: string | null }> {
    const match = await this.getOrLoad(tableId);
    return this.withLock(match, async () => {
      if (match.status !== 'finished') {
        throw new ManagerError('sin_terminar', 'La partida sigue en curso.');
      }
      const seat = this.seatOf(match, userId);
      if (!seat)
        throw new ManagerError('sin_asiento', 'Sin asiento en esta mesa.');
      if (match.rematchNewCode) return { newCode: match.rematchNewCode };
      match.rematchVotes.add(seat);
      await this.db
        .update(tables)
        .set({ rematchVotes: [...match.rematchVotes] })
        .where(eq(tables.id, tableId));
      if (match.rematchVotes.size >= 2 && match.seats.size >= 2) {
        const seats = [...match.seats.values()];
        // Nueva mesa con los mismos jugadores y asientos.
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = randomTableCode();
          try {
            const [row] = await this.db
              .insert(tables)
              .values({ code, status: 'waiting', hostUserId: seats[0].userId })
              .returning({ id: tables.id, code: tables.code });
            for (const s of seats) {
              await this.db.insert(tableSeats).values({
                tableId: row.id,
                seat: s.seat,
                userId: s.userId,
              });
            }
            await this.db
              .update(tables)
              .set({
                newTableId: row.id,
                rematchVotes: [...match.rematchVotes],
              })
              .where(eq(tables.id, tableId));
            match.rematchNewCode = code;
            await bumpMetric(this.db, 'tables_created');
            const fresh = await this.getOrLoad(row.id);
            await this.withLock(fresh, async () => {
              await this.startMatch(fresh);
            });
            this.broadcast(match);
            this.io?.to(this.room(match)).emit('mesa:revancha-lista', { code });
            return { newCode: code };
          } catch (err) {
            if (!isUniqueViolation(err) || attempt === 4) throw err;
          }
        }
        throw new Error('No se pudo crear la mesa de revancha.');
      }
      this.broadcast(match);
      return { newCode: null };
    });
  }

  /* ------------------------- internas ------------------------- */

  private async startMatch(match: ActiveMatch): Promise<void> {
    const seed = randomInt(1, 2147483647);
    const state = createMatch(seed);
    match.state = state;
    match.version = 0;
    match.status = 'playing';
    await this.db.insert(games).values({
      tableId: match.tableId,
      state: state as unknown as Record<string, unknown>,
      version: 0,
      rulesVersion: 'v1',
      seed,
    });
    await this.db
      .update(tables)
      .set({ status: 'playing' })
      .where(eq(tables.id, match.tableId));
    this.armTimers(match);
    this.broadcast(match);
  }

  private async persistTransition(
    match: ActiveMatch,
    op: {
      commandId: string;
      actor: PlayerId | null;
      action: Action;
      next: MatchState;
      server: boolean;
    },
  ): Promise<void> {
    const seq = match.version + 1;
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(gameEvents).values({
          tableId: match.tableId,
          seq,
          commandId: op.commandId,
          actor: op.actor,
          action: op.action as unknown as Record<string, unknown>,
          server: op.server,
        });
        const finished = op.next.status === 'over';
        await tx
          .update(games)
          .set({
            state: op.next as unknown as Record<string, unknown>,
            version: seq,
            updatedAt: new Date(),
            ...(finished
              ? {
                  result: {
                    winner: op.next.winner,
                    scores: op.next.scores,
                    reason: 'puntos',
                    bySeat: op.actor,
                  },
                }
              : {}),
          })
          .where(eq(games.tableId, match.tableId));
        if (finished) {
          await tx
            .update(tables)
            .set({ status: 'finished', finishedAt: new Date() })
            .where(eq(tables.id, match.tableId));
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Carrera perdida contra un reintento con el mismo commandId.
        return;
      }
      throw err;
    }
    match.state = op.next;
    match.version = seq;
    if (op.next.status === 'over' && op.next.winner) {
      match.status = 'finished';
      match.result = {
        winner: op.next.winner,
        reason: 'puntos',
        bySeat: op.actor,
      };
      this.clearTurnTimer(match);
      this.clearGrace(match);
      await bumpMetric(this.db, 'matches_completed');
    }
  }

  private afterTransition(match: ActiveMatch): void {
    if (match.status === 'playing') this.armTimers(match);
    this.broadcast(match);
  }

  private seatOf(match: ActiveMatch, userId: string): PlayerId | null {
    for (const s of match.seats.values()) {
      if (s.userId === userId) return s.seat;
    }
    return null;
  }

  /** ¿Quién debe actuar ahora? (responde un canto, o le toca jugar). */
  private actorToMove(match: ActiveMatch): PlayerId {
    const pending = match.state.hand.pending;
    if (pending) return other(pending.by);
    return match.state.hand.toPlay;
  }

  private armTimers(match: ActiveMatch): void {
    this.clearTurnTimer(match);
    if (match.status !== 'playing') return;
    // Si el que debe actuar está desconectado, manda la gracia, no el turno.
    const seat = this.actorToMove(match);
    const runtime = match.seats.get(seat);
    if (!runtime?.online && runtime) {
      this.armGrace(match, seat);
      return;
    }
    const pending = match.state.hand.pending;
    const kind: 'play' | 'respond' = pending ? 'respond' : 'play';
    const seconds =
      kind === 'play'
        ? this.config.turnPlaySeconds
        : this.config.turnRespondSeconds;
    const deadlineAt = Date.now() + seconds * 1000;
    match.turnKind = kind;
    match.turnDeadlineAt = deadlineAt;
    match.turnTimer = setTimeout(() => {
      void this.onTurnTimeout(match.tableId, seat, kind, deadlineAt);
    }, seconds * 1000);
    match.turnTimer.unref?.();
  }

  private async onTurnTimeout(
    tableId: string,
    seat: PlayerId,
    kind: 'play' | 'respond',
    deadlineAt: number,
  ): Promise<void> {
    const match = this.matches.get(tableId);
    if (!match || match.status !== 'playing') return;
    if (match.turnDeadlineAt !== deadlineAt) return; // timer obsoleto
    await this.withLock(match, async () => {
      if (match.status !== 'playing' || match.turnDeadlineAt !== deadlineAt)
        return;
      if (this.actorToMove(match) !== seat) return;
      const legal = legalActions(match.state, seat);
      let action: Action | null = null;
      if (kind === 'respond') {
        if (legal.some((a) => a.type === 'noQuiero'))
          action = { type: 'noQuiero' };
      } else {
        // Juega la carta más baja disponible (determinista y documentado).
        const plays = legal.filter((a) => a.type === 'play');
        if (plays.length > 0) {
          const hand = match.state.hand.hands[seat];
          const sorted = [...hand].sort(
            (a, b) => cardWeight(a) - cardWeight(b) || a.rank - b.rank,
          );
          const lowest = sorted[0];
          action = {
            type: 'play',
            card: `${lowest.rank}-${lowest.suit.slice(0, -1)}`,
          };
        }
      }
      if (!action && legal.some((a) => a.type === 'mazo'))
        action = { type: 'mazo' };
      if (!action) return;
      const next = applyAction(match.state, seat, action);
      await this.persistTransition(match, {
        commandId: randomUUID(),
        actor: seat,
        action,
        next,
        server: true,
      });
      this.afterTransition(match);
    });
  }

  private armGrace(match: ActiveMatch, seat: PlayerId): void {
    if (match.graceTimer && match.graceSeat === seat) return;
    this.clearGrace(match);
    match.graceSeat = seat;
    match.graceTimer = setTimeout(() => {
      void this.withLock(match, async () => {
        const runtime = match.seats.get(seat);
        if (!runtime || runtime.online || match.status !== 'playing') return;
        await this.forfeit(match, seat, 'se agotó el tiempo de reconexión');
      });
    }, this.config.graceSeconds * 1000);
    match.graceTimer.unref?.();
  }

  private async forfeit(
    match: ActiveMatch,
    seat: PlayerId,
    detail: string,
  ): Promise<void> {
    const winner = other(seat);
    await this.db.transaction(async (tx) => {
      await tx
        .update(games)
        .set({
          result: {
            winner,
            scores: match.state.scores,
            reason: 'abandono',
            bySeat: seat,
            detail,
          },
          updatedAt: new Date(),
        })
        .where(eq(games.tableId, match.tableId));
      await tx
        .update(tables)
        .set({ status: 'finished', finishedAt: new Date() })
        .where(eq(tables.id, match.tableId));
    });
    match.status = 'finished';
    match.result = { winner, reason: 'abandono', bySeat: seat };
    this.clearTurnTimer(match);
    this.clearGrace(match);
    await bumpMetric(this.db, 'match_abandons');
    await bumpMetric(this.db, 'matches_completed');
    this.broadcast(match);
  }

  private clearTurnTimer(match: ActiveMatch): void {
    if (match.turnTimer) clearTimeout(match.turnTimer);
    match.turnTimer = null;
    match.turnDeadlineAt = null;
    match.turnKind = null;
  }

  private clearGrace(match: ActiveMatch): void {
    if (match.graceTimer) clearTimeout(match.graceTimer);
    match.graceTimer = null;
    match.graceSeat = null;
  }

  private room(match: ActiveMatch): string {
    return `mesa:${match.code}`;
  }

  /** Emite a cada socket SU vista filtrada (nunca la mano ajena). */
  broadcast(match: ActiveMatch): void {
    const io = this.io;
    if (!io) return;
    void io
      .in(this.room(match))
      .fetchSockets()
      .then((sockets) => {
        for (const socket of sockets) {
          const seat = socket.data['seat'] as PlayerId | undefined;
          if (seat !== 'p0' && seat !== 'p1') continue;
          socket.emit(
            'mesa:estado',
            buildSnapshot(
              {
                code: match.code,
                status: match.status,
                seq: match.version,
                state: match.state,
                seats: [...match.seats.values()].map((s) => ({
                  seat: s.seat,
                  name: s.name,
                  online: s.online,
                })),
                result: this.resultView(match),
                timers:
                  match.turnKind && match.turnDeadlineAt
                    ? {
                        kind: match.turnKind,
                        seat: this.actorToMove(match),
                        deadlineAt: match.turnDeadlineAt,
                      }
                    : null,
                rematchVotes: [...match.rematchVotes],
                rematchNewCode: match.rematchNewCode,
              },
              seat,
            ),
          );
        }
      })
      .catch((err) => {
        console.error(
          JSON.stringify({ msg: 'error en broadcast', err: String(err) }),
        );
      });
  }

  snapshotFor(match: ActiveMatch, seat: PlayerId) {
    return buildSnapshot(
      {
        code: match.code,
        status: match.status,
        seq: match.version,
        state: match.state,
        seats: [...match.seats.values()].map((s) => ({
          seat: s.seat,
          name: s.name,
          online: s.online,
        })),
        result: this.resultView(match),
        timers:
          match.turnKind && match.turnDeadlineAt
            ? {
                kind: match.turnKind,
                seat: this.actorToMove(match),
                deadlineAt: match.turnDeadlineAt,
              }
            : null,
        rematchVotes: [...match.rematchVotes],
        rematchNewCode: match.rematchNewCode,
      },
      seat,
    );
  }

  private resultView(match: ActiveMatch) {
    if (match.status !== 'finished') return null;
    return match.result;
  }

  /** Ejecuta fn con el mutex de la mesa. */
  async withLock<T>(match: ActiveMatch, fn: () => Promise<T>): Promise<T> {
    const run = match.chain.then(fn, fn);
    match.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private humanize(code: string): string {
    switch (code) {
      case 'ILLEGAL_ACTION':
        return 'Esa jugada no es legal en este momento.';
      case 'CARD_NOT_HELD':
        return 'Esa carta ya no está en tu mano.';
      case 'NO_PENDING':
        return 'No hay canto pendiente.';
      case 'MATCH_OVER':
        return 'La partida ya terminó.';
      default:
        return 'Jugada rechazada.';
    }
  }

  /** Solo pruebas: vacía el registro en memoria (simula reinicio). */
  clearMemoryForTests(): void {
    for (const match of this.matches.values()) {
      this.clearTurnTimer(match);
      this.clearGrace(match);
    }
    this.matches.clear();
    this.byCode.clear();
  }

  shutdown(): void {
    for (const match of this.matches.values()) {
      this.clearTurnTimer(match);
      this.clearGrace(match);
    }
  }
}

export class ManagerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}
