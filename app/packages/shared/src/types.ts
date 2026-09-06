import type {
  Action,
  Card,
  EnvidoResult,
  LastEvent,
  PendingBid,
  PendingKind,
  PlayerId,
  TrickPlay,
  TrickResult,
  TrucoLevel,
} from '@limfosan/juego-truco';

/**
 * Vista de partida filtrada por asiento (E4).
 *
 * El servidor la construye por jugador: incluye solo SU mano; del rival
 * únicamente la cantidad de cartas ocultas. Las cartas jugadas (`played`)
 * y el resultado del envido son públicos una vez resueltos.
 * NUNCA incluye `initialHands` ni la mano ajena.
 */
export interface SeatPresence {
  seat: PlayerId;
  name: string;
  online: boolean;
  you: boolean;
}

export interface HandView {
  handNumber: number;
  mano: PlayerId;
  /** Solo las cartas del dueño de la vista. */
  myCards: Card[];
  /** Cartas ocultas del rival (cantidad, sin identidades). */
  rivalCount: number;
  /** Cartas sobre la mesa: información pública. */
  played: TrickPlay[];
  trickWinners: TrickResult[];
  toPlay: PlayerId;
  trucoLevel: TrucoLevel;
  pending: PendingBid | null;
  envidoResolved: boolean;
}

export type MatchResultReason = 'puntos' | 'abandono';

export interface MatchResultView {
  winner: PlayerId;
  scores: Record<PlayerId, number>;
  reason: MatchResultReason;
  bySeat: PlayerId | null;
}

export interface TimerView {
  kind: 'play' | 'respond';
  seat: PlayerId;
  /** Epoch ms del vencimiento (reloj del servidor). */
  deadlineAt: number;
}

export interface MatchSnapshot {
  /** Versión del formato de vista (para evolución sin romper clientes). */
  v: 1;
  rulesVersion: 'v1';
  table: { code: string; status: 'waiting' | 'playing' | 'finished' };
  /** Secuencia monótona de la partida: ordena estados y reintentos. */
  seq: number;
  me: { seat: PlayerId; name: string };
  seats: SeatPresence[];
  scores: Record<PlayerId, number>;
  target: 30;
  hand: HandView;
  /** Acciones legales calculadas por el servidor para mi asiento. */
  allowed: Action[];
  mazo: { points: number; to: PlayerId } | null;
  lastEvent: LastEvent;
  timers: TimerView | null;
  result: MatchResultView | null;
  rematch: { votes: PlayerId[]; newCode: string | null };
}

export interface TableMeta {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  seats: SeatPresence[];
  scores: Record<PlayerId, number> | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Protocolo Socket.IO (tipado en ambos extremos)                      */
/* ------------------------------------------------------------------ */

export interface JoinResult {
  ok: boolean;
  error?: string;
  snapshot?: MatchSnapshot;
}

export interface ActionAck {
  ok: boolean;
  error?: string;
  /** true si el commandId ya existía: el efecto NO se duplicó. */
  duplicate?: boolean;
  seq?: number;
}

export interface ClientToServerEvents {
  'mesa:unirse': (
    payload: { code: string },
    ack: (res: JoinResult) => void,
  ) => void;
  'mesa:accion': (
    payload: { commandId: string; action: Action },
    ack: (res: ActionAck) => void,
  ) => void;
  'mesa:revancha': (
    ack: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'mesa:saludo': (payload: { text: string }) => void;
  'mesa:salir': (ack: (res: { ok: boolean }) => void) => void;
}

export interface ServerToClientEvents {
  'mesa:estado': (snapshot: MatchSnapshot) => void;
  'mesa:error': (error: { code: string; message: string }) => void;
  'mesa:revancha-lista': (payload: { code: string }) => void;
  'mesa:saludo': (payload: { from: string; text: string }) => void;
}

/* ------------------------------------------------------------------ */
/* Re-export de tipos del motor usados por la UI                       */
/* ------------------------------------------------------------------ */

export type {
  Action,
  Card,
  EnvidoResult,
  LastEvent,
  PendingBid,
  PendingKind,
  PlayerId,
  TrickPlay,
  TrickResult,
  TrucoLevel,
};
