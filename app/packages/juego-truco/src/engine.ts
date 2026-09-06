/**
 * Motor puro del Truco argentino 1v1 — reglamento v1.
 *
 * Sin I/O y sin azar oculto: el reparto deriva de una semilla explícita.
 * Cada transición es una función pura que devuelve un estado nuevo o lanza
 * EngineError si la acción es ilegal (la entrada nunca se muta).
 *
 * Simplificaciones documentadas respecto de una mesa real (no cambian el
 * reglamento v1, solo el orden de palabra):
 * - Los cantos de apertura se hacen en el propio turno de juego (no fuera de turno).
 * - Quien aceptó una subida puede recantar en cualquier momento sin canto
 *   pendiente (incluido el inmediato "quiero, retruco").
 *
 * Referencia de reglas: docs/reglamento-truco-v1.md
 */
import { buildDeck, type Card, type Rank, type Suit } from './cards.js';

export type { Card, Rank, Suit };

export type PlayerId = 'p0' | 'p1';
export const other = (p: PlayerId): PlayerId => (p === 'p0' ? 'p1' : 'p0');

export type CardId = string;

/** Id estable que coincide con los PNG (`1-espada.png`, …). */
export function cardId(card: Card): CardId {
  return `${card.rank}-${card.suit.slice(0, -1)}`;
}

export function cardLabel(card: Card): string {
  return `${card.rank} de ${card.suit}`;
}

/** Jerarquía v1 §2: mayor peso gana la baza; igual peso = parda. */
const WEIGHT: Record<Suit, readonly number[]> = {
  espadas: [0, 13, 8, 9, 0, 1, 2, 11, 0, 0, 4, 5, 6],
  bastos: [0, 12, 8, 9, 0, 1, 2, 3, 0, 0, 4, 5, 6],
  oros: [0, 7, 8, 9, 0, 1, 2, 10, 0, 0, 4, 5, 6],
  copas: [0, 7, 8, 9, 0, 1, 2, 3, 0, 0, 4, 5, 6],
};

export function cardWeight(card: Card): number {
  return WEIGHT[card.suit][card.rank] ?? 0;
}

const pipValue = (rank: Rank): number => (rank <= 7 ? rank : 0);

/** Valor de envido de 3 cartas (v1 §5). */
export function envidoValue(hand: readonly Card[]): number {
  let best = 0;
  for (const card of hand) best = Math.max(best, pipValue(card.rank));
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const a = hand[i];
      const b = hand[j];
      if (a.suit === b.suit) {
        best = Math.max(best, pipValue(a.rank) + pipValue(b.rank) + 20);
      }
    }
  }
  return best;
}

/** Azar explícito y reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledDeck(seed: number): Card[] {
  const deck = buildDeck();
  const rnd = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

export type TrucoLevel = 0 | 1 | 2 | 3;
export const TRUCO_WORTH: readonly [1, 2, 3, 4] = [1, 2, 3, 4];

export type PendingKind =
  'truco' | 'retruco' | 'valeCuatro' | 'envido' | 'realEnvido' | 'faltaEnvido';

export interface PendingBid {
  kind: PendingKind;
  by: PlayerId;
}

export type Action =
  | { type: 'play'; card: CardId }
  | { type: 'envido' }
  | { type: 'realEnvido' }
  | { type: 'faltaEnvido' }
  | { type: 'quiero' }
  | { type: 'noQuiero' }
  | { type: 'truco' }
  | { type: 'retruco' }
  | { type: 'valeCuatro' }
  | { type: 'mazo' };

export interface TrickPlay {
  player: PlayerId;
  card: Card;
}

export type TrickResult = PlayerId | 'parda';

export interface EnvidoResult {
  values: Record<PlayerId, number>;
  winner: PlayerId;
  points: number;
}

export interface LastEvent {
  kind:
    | 'deal'
    | 'play'
    | 'bid'
    | 'response'
    | 'envidoResult'
    | 'handEnd'
    | 'matchEnd'
    | 'mazo';
  by: PlayerId | null;
  summary: string;
  /** En eventos 'bid': qué se cantó (para vistas por asiento). */
  bidKind?: PendingKind;
  /** En eventos 'response': qué se respondió (para vistas por asiento). */
  response?: 'quiero' | 'noQuiero';
  envido?: EnvidoResult;
  handWinner?: PlayerId;
  handPoints?: number;
  matchWinner?: PlayerId;
}

export interface HandState {
  handNumber: number;
  mano: PlayerId;
  hands: Record<PlayerId, Card[]>;
  initialHands: Record<PlayerId, Card[]>;
  played: TrickPlay[];
  trickWinners: TrickResult[];
  leader: PlayerId;
  toPlay: PlayerId;
  firstPlayed: Record<PlayerId, boolean>;
  trucoLevel: TrucoLevel;
  lastAccepter: PlayerId | null;
  pending: PendingBid | null;
  suspendedTruco: PendingBid | null;
  envidoChain: Array<'envido' | 'realEnvido'>;
  envidoResolved: boolean;
}

export interface MatchState {
  rulesVersion: 'v1';
  target: 30;
  scores: Record<PlayerId, number>;
  hand: HandState;
  status: 'playing' | 'over';
  winner: PlayerId | null;
  seed: number;
  lastEvent: LastEvent;
}

export class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Creación                                                            */
/* ------------------------------------------------------------------ */

function dealHand(
  seed: number,
  handNumber: number,
  mano: PlayerId,
  hands?: Record<PlayerId, Card[]>,
): HandState {
  const dealt =
    hands ??
    (() => {
      const deck = shuffledDeck((seed ^ (handNumber * 2654435761)) >>> 0);
      return {
        p0: [deck[0], deck[2], deck[4]],
        p1: [deck[1], deck[3], deck[5]],
      } as Record<PlayerId, Card[]>;
    })();
  return {
    handNumber,
    mano,
    hands: { p0: [...dealt.p0], p1: [...dealt.p1] },
    initialHands: { p0: [...dealt.p0], p1: [...dealt.p1] },
    played: [],
    trickWinners: [],
    leader: mano,
    toPlay: mano,
    firstPlayed: { p0: false, p1: false },
    trucoLevel: 0,
    lastAccepter: null,
    pending: null,
    suspendedTruco: null,
    envidoChain: [],
    envidoResolved: false,
  };
}

export function createMatch(
  seed: number = Date.now() % 2147483647,
): MatchState {
  return {
    rulesVersion: 'v1',
    target: 30,
    scores: { p0: 0, p1: 0 },
    hand: dealHand(seed, 1, 'p0'),
    status: 'playing',
    winner: null,
    seed,
    lastEvent: {
      kind: 'deal',
      by: null,
      summary: 'Se repartió la primera mano. Sale la mano (vos).',
    },
  };
}

/**
 * Constructor para pruebas: manos y puntajes fijos.
 * Las cartas se pasan como ids (`1-espada`) y se validan contra el mazo.
 */
export function createCustomMatch(options: {
  hands: [CardId[], CardId[]];
  mano?: PlayerId;
  scores?: [number, number];
  seed?: number;
}): MatchState {
  const deck = buildDeck();
  const byId = new Map(deck.map((c) => [cardId(c), c]));
  const pick = (ids: CardId[]): Card[] =>
    ids.map((id) => {
      const card = byId.get(id);
      if (!card) throw new EngineError('UNKNOWN_CARD', `Carta inválida: ${id}`);
      return { ...card };
    });
  const [h0, h1] = options.hands;
  const used = new Set([...h0, ...h1]);
  if (used.size !== h0.length + h1.length) {
    throw new EngineError('DUPLICATE_CARD', 'Mano con cartas repetidas');
  }
  const mano = options.mano ?? 'p0';
  const [s0, s1] = options.scores ?? [0, 0];
  return {
    rulesVersion: 'v1',
    target: 30,
    scores: { p0: s0, p1: s1 },
    hand: dealHand(options.seed ?? 1, 1, mano, {
      p0: pick(h0),
      p1: pick(h1),
    }),
    status: 'playing',
    winner: null,
    seed: options.seed ?? 1,
    lastEvent: { kind: 'deal', by: null, summary: 'Mano de prueba repartida.' },
  };
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

const TRUCO_LEVEL_OF: Record<'truco' | 'retruco' | 'valeCuatro', TrucoLevel> = {
  truco: 1,
  retruco: 2,
  valeCuatro: 3,
};

const REJECTION_POINTS: Record<'truco' | 'retruco' | 'valeCuatro', number> = {
  truco: 1,
  retruco: 2,
  valeCuatro: 3,
};

const ENVIDO_POINTS: Record<'envido' | 'realEnvido', number> = {
  envido: 2,
  realEnvido: 3,
};

export function bidLabel(kind: PendingKind): string {
  switch (kind) {
    case 'truco':
      return '¡Truco!';
    case 'retruco':
      return '¡Retruco!';
    case 'valeCuatro':
      return '¡Vale cuatro!';
    case 'envido':
      return '¡Envido!';
    case 'realEnvido':
      return '¡Real envido!';
    case 'faltaEnvido':
      return '¡Falta envido!';
  }
}

function envidoPossible(hand: HandState): boolean {
  return !hand.envidoResolved && !(hand.firstPlayed.p0 && hand.firstPlayed.p1);
}

/** Subidas de envido permitidas como respuesta al canto pendiente. */
function envidoRaises(
  hand: HandState,
): Array<'envido' | 'realEnvido' | 'faltaEnvido'> {
  const pending = hand.pending;
  if (!pending) return [];
  const envidoCount =
    hand.envidoChain.filter((k) => k === 'envido').length +
    (pending.kind === 'envido' ? 1 : 0);
  switch (pending.kind) {
    case 'envido':
      // R22: como máximo dos envidos en la cadena.
      return envidoCount < 2
        ? ['envido', 'realEnvido', 'faltaEnvido']
        : ['realEnvido', 'faltaEnvido'];
    case 'realEnvido':
      // Se aceptan varios real envido seguidos; nunca un envido menor (R23).
      return ['realEnvido', 'faltaEnvido'];
    default:
      return [];
  }
}

/** Acciones legales de un jugador en este estado (para UI y validación). */
export function legalActions(state: MatchState, player: PlayerId): Action[] {
  if (state.status !== 'playing') return [];
  const hand = state.hand;
  const pending = hand.pending;

  if (pending) {
    if (player !== other(pending.by)) return [];
    const actions: Action[] = [{ type: 'quiero' }, { type: 'noQuiero' }];
    if (pending.kind === 'truco' && envidoPossible(hand)) {
      // v1 §5.3: el envido tiene prioridad sobre el truco pendiente.
      actions.push(
        { type: 'envido' },
        { type: 'realEnvido' },
        { type: 'faltaEnvido' },
      );
    } else if (pending.kind === 'envido' || pending.kind === 'realEnvido') {
      for (const raise of envidoRaises(hand)) actions.push({ type: raise });
    }
    actions.push({ type: 'mazo' });
    return actions;
  }

  const actions: Action[] = [];
  if (hand.lastAccepter === player) {
    // v1 §4.1: solo quien aceptó la subida anterior puede recantar,
    // de inmediato o más tarde, sin canto pendiente.
    if (hand.trucoLevel === 1) actions.push({ type: 'retruco' });
    if (hand.trucoLevel === 2) actions.push({ type: 'valeCuatro' });
  }
  if (hand.toPlay !== player) return actions;
  const plays: Action[] = hand.hands[player].map((card) => ({
    type: 'play',
    card: cardId(card),
  }));
  actions.push(...plays);
  if (envidoPossible(hand)) {
    actions.push(
      { type: 'envido' },
      { type: 'realEnvido' },
      { type: 'faltaEnvido' },
    );
  }
  if (hand.trucoLevel === 0) {
    actions.push({ type: 'truco' });
  }
  actions.push({ type: 'mazo' });
  return actions;
}

/** Vista previa del mazo para confirmar en la UI (v1 §6). */
export function mazoPreview(
  state: MatchState,
  player: PlayerId,
): { points: number; to: PlayerId } {
  const hand = state.hand;
  const rival = other(player);
  const pending = hand.pending;
  if (pending && other(pending.by) === player) {
    if (
      pending.kind === 'truco' ||
      pending.kind === 'retruco' ||
      pending.kind === 'valeCuatro'
    ) {
      return { points: REJECTION_POINTS[pending.kind], to: pending.by };
    }
    const chainTotal = hand.envidoChain.reduce(
      (acc, kind) => acc + ENVIDO_POINTS[kind],
      0,
    );
    return { points: chainTotal > 0 ? chainTotal : 1, to: pending.by };
  }
  if (hand.trucoLevel > 0)
    return { points: TRUCO_WORTH[hand.trucoLevel], to: rival };
  return { points: 1, to: rival };
}

/* ------------------------------------------------------------------ */
/* Transiciones                                                        */
/* ------------------------------------------------------------------ */

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'play' && b.type === 'play') return a.card === b.card;
  return true;
}

function resolveTrick(plays: [TrickPlay, TrickPlay]): TrickResult {
  const [first, second] = plays;
  const w1 = cardWeight(first.card);
  const w2 = cardWeight(second.card);
  if (w1 === w2) return 'parda';
  return w1 > w2 ? first.player : second.player;
}

/** Ganador de la mano según v1 §3, o null si hay que seguir jugando. */
function decideHand(hand: HandState): PlayerId | null {
  const wins = { p0: 0, p1: 0 };
  for (const result of hand.trickWinners) {
    if (result !== 'parda') wins[result] += 1;
  }
  if (wins.p0 === 2) return 'p0';
  if (wins.p1 === 2) return 'p1';
  if (hand.trickWinners.length === 2) {
    // Una parda y una ganada: gana quien ganó la otra (R5).
    const [first, second] = hand.trickWinners;
    if (first === 'parda' && second !== 'parda') return second;
    if (second === 'parda' && first !== 'parda') return first;
    return null;
  }
  if (hand.trickWinners.length === 3) {
    if (hand.trickWinners.every((r) => r === 'parda')) return hand.mano; // R6
    return hand.trickWinners.find((r) => r !== 'parda') as PlayerId; // la más temprana
  }
  return null;
}

function showdownWinner(hand: HandState): {
  winner: PlayerId;
  values: Record<PlayerId, number>;
} {
  const values = {
    p0: envidoValue(hand.initialHands.p0),
    p1: envidoValue(hand.initialHands.p1),
  };
  if (values.p0 === values.p1) return { winner: hand.mano, values };
  return { winner: values.p0 > values.p1 ? 'p0' : 'p1', values };
}

function nextHand(state: MatchState): void {
  const mano: PlayerId = other(state.hand.mano);
  state.hand = dealHand(state.seed, state.hand.handNumber + 1, mano);
}

function finishIfNeeded(state: MatchState): boolean {
  const winner =
    state.scores.p0 >= state.target
      ? 'p0'
      : state.scores.p1 >= state.target
        ? 'p1'
        : null;
  if (winner) {
    state.status = 'over';
    state.winner = winner;
    return true;
  }
  return false;
}

function nameOf(player: PlayerId): string {
  return player === 'p0' ? 'Vos' : 'La CPU';
}

export function applyAction(
  state: MatchState,
  player: PlayerId,
  action: Action,
): MatchState {
  if (state.status !== 'playing') {
    throw new EngineError('MATCH_OVER', 'La partida ya terminó.');
  }
  const legal = legalActions(state, player);
  if (!legal.some((candidate) => sameAction(candidate, action))) {
    throw new EngineError('ILLEGAL_ACTION', `Acción ilegal: ${action.type}.`);
  }
  const next: MatchState = structuredClone(state);
  const hand = next.hand;
  const rival = other(player);

  switch (action.type) {
    case 'play': {
      const index = hand.hands[player].findIndex(
        (c) => cardId(c) === action.card,
      );
      if (index < 0)
        throw new EngineError('CARD_NOT_HELD', 'Esa carta no está en tu mano.');
      const [card] = hand.hands[player].splice(index, 1);
      hand.played.push({ player, card });
      hand.firstPlayed[player] = true;
      next.lastEvent = {
        kind: 'play',
        by: player,
        summary: `${nameOf(player)} ${player === 'p0' ? 'jugaste' : 'jugó'} el ${cardLabel(card)}.`,
      };
      if (hand.played.length % 2 === 0) {
        const trick = hand.played.slice(-2) as [TrickPlay, TrickPlay];
        const result = resolveTrick(trick);
        hand.trickWinners.push(result);
        hand.leader = result === 'parda' ? hand.leader : result;
        hand.toPlay = hand.leader;
      } else {
        hand.toPlay = rival;
      }
      const winner = decideHand(hand);
      if (winner) {
        const points = TRUCO_WORTH[hand.trucoLevel];
        next.scores[winner] += points;
        if (finishIfNeeded(next)) {
          next.lastEvent = {
            kind: 'matchEnd',
            by: winner,
            summary: `¡${nameOf(winner)} ${winner === 'p0' ? 'ganaste' : 'ganó'} la partida ${next.scores.p0} a ${next.scores.p1}!`,
            handWinner: winner,
            handPoints: points,
            matchWinner: winner,
          };
        } else {
          next.lastEvent = {
            kind: 'handEnd',
            by: winner,
            summary: `${nameOf(winner)} ${winner === 'p0' ? 'ganaste' : 'ganó'} la mano (+${points}).`,
            handWinner: winner,
            handPoints: points,
          };
          nextHand(next);
        }
      }
      return next;
    }

    case 'truco':
    case 'retruco':
    case 'valeCuatro':
    case 'envido':
    case 'realEnvido':
    case 'faltaEnvido': {
      if (
        action.type === 'envido' ||
        action.type === 'realEnvido' ||
        action.type === 'faltaEnvido'
      ) {
        if (
          hand.pending &&
          (hand.pending.kind === 'envido' || hand.pending.kind === 'realEnvido')
        ) {
          // Subida: el canto anterior queda aceptado implícitamente.
          hand.envidoChain.push(hand.pending.kind);
        } else if (hand.pending) {
          hand.suspendedTruco = hand.pending;
        }
      }
      hand.pending = { kind: action.type, by: player };
      const worth =
        action.type === 'truco'
          ? 'La mano vale 2.'
          : action.type === 'retruco'
            ? 'La mano vale 3.'
            : action.type === 'valeCuatro'
              ? 'La mano vale 4.'
              : action.type === 'envido'
                ? 'Vale 2 puntos.'
                : action.type === 'realEnvido'
                  ? 'Vale 3 puntos.'
                  : 'Vale el resto del puntero.';
      next.lastEvent = {
        kind: 'bid',
        by: player,
        summary: `${nameOf(player)} ${player === 'p0' ? 'cantaste' : 'cantó'}: ${bidLabel(action.type)} ${worth}`,
        bidKind: action.type,
      };
      return next;
    }

    case 'quiero': {
      const pending = hand.pending;
      if (!pending)
        throw new EngineError('NO_PENDING', 'No hay canto pendiente.');
      if (
        pending.kind === 'truco' ||
        pending.kind === 'retruco' ||
        pending.kind === 'valeCuatro'
      ) {
        hand.trucoLevel = TRUCO_LEVEL_OF[pending.kind];
        hand.lastAccepter = player;
        hand.pending = null;
        next.lastEvent = {
          kind: 'response',
          by: player,
          response: 'quiero',
          summary: `¡Quiero! La mano vale ${TRUCO_WORTH[hand.trucoLevel]} puntos.`,
        };
        return next;
      }
      // Envido: definir el pozo y comparar.
      let points: number;
      if (pending.kind === 'faltaEnvido') {
        points = next.target - Math.max(next.scores.p0, next.scores.p1);
      } else {
        const accepted: Array<'envido' | 'realEnvido'> = [
          ...hand.envidoChain,
          pending.kind,
        ];
        points = accepted.reduce((acc, kind) => acc + ENVIDO_POINTS[kind], 0);
      }
      const { winner, values } = showdownWinner(hand);
      next.scores[winner] += points;
      hand.envidoResolved = true;
      const suspended = hand.suspendedTruco;
      hand.suspendedTruco = null;
      hand.pending = suspended;
      const result: EnvidoResult = { values, winner, points };
      if (finishIfNeeded(next)) {
        next.lastEvent = {
          kind: 'matchEnd',
          by: winner,
          response: 'quiero',
          summary: `Envido ${points} para ${nameOf(winner) === 'Vos' ? 'vos' : 'la CPU'} (${values.p0} a ${values.p1}). ¡Partida ${next.scores.p0} a ${next.scores.p1}!`,
          envido: result,
          matchWinner: winner,
        };
      } else {
        next.lastEvent = {
          kind: 'envidoResult',
          by: winner,
          response: 'quiero',
          summary:
            `Envido: vos ${values.p0}, CPU ${values.p1}. ` +
            `Gana ${nameOf(winner) === 'Vos' ? 'vos' : 'la CPU'} (+${points}).` +
            (suspended ? ' Ahora respondé el truco pendiente.' : ''),
          envido: result,
        };
      }
      return next;
    }

    case 'noQuiero': {
      const pending = hand.pending;
      if (!pending)
        throw new EngineError('NO_PENDING', 'No hay canto pendiente.');
      if (
        pending.kind === 'truco' ||
        pending.kind === 'retruco' ||
        pending.kind === 'valeCuatro'
      ) {
        const points = REJECTION_POINTS[pending.kind];
        next.scores[pending.by] += points;
        if (finishIfNeeded(next)) {
          next.lastEvent = {
            kind: 'matchEnd',
            by: pending.by,
            response: 'noQuiero',
            summary: `${bidLabel(pending.kind)} no querido. ¡Partida ${next.scores.p0} a ${next.scores.p1}!`,
            matchWinner: next.winner ?? undefined,
          };
        } else {
          next.lastEvent = {
            kind: 'handEnd',
            by: pending.by,
            response: 'noQuiero',
            summary: `${bidLabel(pending.kind)} no querido: ${nameOf(pending.by) === 'Vos' ? 'vos sumás' : 'la CPU suma'} ${points}.`,
            handWinner: pending.by,
            handPoints: points,
          };
          nextHand(next);
        }
        return next;
      }
      const chainTotal = hand.envidoChain.reduce(
        (acc, kind) => acc + ENVIDO_POINTS[kind],
        0,
      );
      const points = chainTotal > 0 ? chainTotal : 1;
      next.scores[pending.by] += points;
      hand.envidoResolved = true;
      const suspended = hand.suspendedTruco;
      hand.suspendedTruco = null;
      hand.pending = suspended;
      if (finishIfNeeded(next)) {
        next.lastEvent = {
          kind: 'matchEnd',
          by: pending.by,
          response: 'noQuiero',
          summary: `Envido rechazado (+${points}). ¡Partida ${next.scores.p0} a ${next.scores.p1}!`,
          matchWinner: next.winner ?? undefined,
        };
      } else {
        next.lastEvent = {
          kind: 'response',
          by: player,
          response: 'noQuiero',
          summary:
            `No quisiste (+${points} para ${nameOf(pending.by) === 'Vos' ? 'vos' : 'la CPU'}).` +
            (suspended ? ' Ahora respondé el truco pendiente.' : ''),
        };
      }
      return next;
    }

    case 'mazo': {
      const preview = mazoPreview(next, player);
      next.scores[preview.to] += preview.points;
      if (finishIfNeeded(next)) {
        next.lastEvent = {
          kind: 'matchEnd',
          by: preview.to,
          summary: `${nameOf(player) === 'Vos' ? 'Te fuiste' : 'La CPU se fue'} al mazo. ¡Partida ${next.scores.p0} a ${next.scores.p1}!`,
          matchWinner: next.winner ?? undefined,
        };
      } else {
        next.lastEvent = {
          kind: 'mazo',
          by: player,
          summary: `${nameOf(player) === 'Vos' ? 'Te fuiste' : 'La CPU se fue'} al mazo (+${preview.points} para ${preview.to === 'p0' ? 'vos' : 'la CPU'}).`,
          handWinner: preview.to,
          handPoints: preview.points,
        };
        nextHand(next);
      }
      return next;
    }
  }
}
