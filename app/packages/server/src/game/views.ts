import {
  TRUCO_WORTH,
  bidLabel,
  cardLabel,
  legalActions,
  mazoPreview,
  type Action,
  type LastEvent,
  type MatchState,
  type PlayerId,
} from '@limfosan/juego-truco';
import type {
  HandView,
  MatchResultView,
  MatchSnapshot,
  TimerView,
} from '@limfosan/shared';

export interface SeatInfo {
  seat: PlayerId;
  name: string;
  online: boolean;
}

export interface ViewInput {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  seq: number;
  state: MatchState;
  seats: SeatInfo[];
  result: {
    winner: PlayerId;
    reason: 'puntos' | 'abandono';
    bySeat: PlayerId | null;
  } | null;
  timers: TimerView | null;
  rematchVotes: PlayerId[];
  rematchNewCode: string | null;
}

/**
 * Resumen del último evento con nombres y persona gramatical correctos
 * para quien lo lee ("Vos jugaste…" / "Ana jugó…"). El motor escribe sus
 * resúmenes pensando en local vs CPU; aquí se reescriben desde los campos
 * estructurados para que cada asiento lea lo correcto.
 */
export function seatSummary(
  state: MatchState,
  event: LastEvent,
  me: PlayerId,
  names: Record<PlayerId, string>,
): string {
  const named = (seat: PlayerId | null): string =>
    seat === null ? '' : seat === me ? 'Vos' : names[seat];
  const verb = (seat: PlayerId | null, yo: string, el: string): string =>
    seat === me ? yo : el;

  switch (event.kind) {
    case 'deal': {
      const mano = state.hand.mano;
      return `Se reparten las cartas. Sale ${mano === me ? 'vos' : names[mano]}.`;
    }
    case 'play': {
      const last = [...state.hand.played]
        .reverse()
        .find((p) => p.player === event.by);
      const carta = last ? ` el ${cardLabel(last.card)}` : '';
      return `${named(event.by)} ${verb(event.by, 'jugaste', 'jugó')}${carta}.`;
    }
    case 'bid': {
      if (!event.bidKind) return event.summary;
      return `${named(event.by)} ${verb(event.by, 'cantaste', 'cantó')}: ${bidLabel(event.bidKind)}`;
    }
    case 'response': {
      if (event.response === 'quiero')
        return `${named(event.by)} ${verb(event.by, 'dijiste', 'dijo')} ¡Quiero!`;
      if (event.response === 'noQuiero')
        return `${named(event.by)} ${verb(event.by, 'dijiste', 'dijo')} no quiero.`;
      return event.summary;
    }
    case 'envidoResult': {
      const result = event.envido;
      if (!result) return event.summary;
      const otherSeat: PlayerId = me === 'p0' ? 'p1' : 'p0';
      const winnerName = result.winner === me ? 'vos' : names[result.winner];
      return (
        `Envido: vos ${result.values[me]}, ${names[otherSeat]} ${result.values[otherSeat]}. ` +
        `Gana ${winnerName} (+${result.points}).`
      );
    }
    case 'handEnd': {
      if (event.handWinner === undefined || event.handPoints === undefined) {
        return event.summary;
      }
      const rejected = event.response === 'noQuiero';
      return rejected
        ? `No quisiste: ${named(event.handWinner) === 'Vos' ? 'sumás' : `${names[event.handWinner]} suma`} ${event.handPoints}.`
        : `${named(event.handWinner)} ${verb(event.handWinner, 'ganaste', 'ganó')} la mano (+${event.handPoints}).`;
    }
    case 'matchEnd': {
      if (event.matchWinner === undefined) return event.summary;
      const s = state.scores;
      return `¡${named(event.matchWinner)} ${verb(event.matchWinner, 'ganaste', 'ganó')} la partida ${s.p0} a ${s.p1}!`;
    }
    case 'mazo': {
      if (event.handWinner === undefined || event.handPoints === undefined) {
        return event.summary;
      }
      const toName = event.handWinner === me ? 'vos' : names[event.handWinner];
      return `${named(event.by)} ${verb(event.by, 'te fuiste', 'se fue')} al mazo (+${event.handPoints} para ${toName}).`;
    }
  }
}
/**
 * Construye el snapshot filtrado para UN asiento.
 * Invariante de privacidad: solo la mano propia; del rival
 * únicamente la cantidad de cartas ocultas. Las cartas jugadas (`played`)
 * y el resultado del envido son públicos una vez resueltos.
 * El resumen del último evento se reescribe por asiento.
 */
export function buildSnapshot(input: ViewInput, me: PlayerId): MatchSnapshot {
  const { state } = input;
  const hand = state.hand;
  const meInfo = input.seats.find((s) => s.seat === me);
  const names = Object.fromEntries(
    input.seats.map((s) => [s.seat, s.name]),
  ) as Record<PlayerId, string>;

  const handView: HandView = {
    handNumber: hand.handNumber,
    mano: hand.mano,
    myCards: hand.hands[me].map((c) => ({ ...c })),
    rivalCount: hand.hands[me === 'p0' ? 'p1' : 'p0'].length,
    played: hand.played.map((p) => ({ player: p.player, card: { ...p.card } })),
    trickWinners: [...hand.trickWinners],
    toPlay: hand.toPlay,
    trucoLevel: hand.trucoLevel,
    pending: hand.pending ? { ...hand.pending } : null,
    envidoResolved: hand.envidoResolved,
  };

  const allowed: Action[] =
    input.status === 'playing' ? legalActions(state, me) : [];
  const mazo =
    input.status === 'playing' && allowed.some((a) => a.type === 'mazo')
      ? mazoPreview(state, me)
      : null;

  let result: MatchResultView | null = null;
  if (input.result) {
    result = {
      winner: input.result.winner,
      scores: { ...state.scores },
      reason: input.result.reason,
      bySeat: input.result.bySeat,
    };
  }

  // Evento visible: en abandonos se sintetiza (el motor no lo conoce);
  // en el resto se reescribe el resumen por asiento.
  const lastEvent: MatchState['lastEvent'] = JSON.parse(
    JSON.stringify(state.lastEvent),
  ) as MatchState['lastEvent'];
  if (input.result?.reason === 'abandono' && input.result.bySeat) {
    const loser = input.result.bySeat;
    const winner = input.result.winner;
    lastEvent.kind = 'matchEnd';
    lastEvent.by = loser;
    lastEvent.matchWinner = winner;
    lastEvent.summary =
      loser === me
        ? `Abandonaste la partida. ¡${names[winner]} ganó ${state.scores.p0} a ${state.scores.p1}!`
        : `${names[loser]} abandonó la partida. ¡Ganaste ${state.scores.p0} a ${state.scores.p1}!`;
  } else {
    lastEvent.summary = seatSummary(state, lastEvent, me, names);
  }

  return {
    v: 1,
    rulesVersion: 'v1',
    table: { code: input.code, status: input.status },
    seq: input.seq,
    me: { seat: me, name: meInfo?.name ?? '?' },
    seats: input.seats.map((s) => ({
      seat: s.seat,
      name: s.name,
      online: s.online,
      you: s.seat === me,
    })),
    scores: { ...state.scores },
    target: state.target,
    hand: handView,
    allowed,
    mazo,
    lastEvent,
    timers: input.timers ? { ...input.timers } : null,
    result,
    rematch: {
      votes: [...input.rematchVotes],
      newCode: input.rematchNewCode,
    },
  };
}

export function trucoWorth(level: 0 | 1 | 2 | 3): number {
  return TRUCO_WORTH[level];
}
