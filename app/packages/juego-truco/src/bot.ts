/**
 * Rival local para la partida en este dispositivo.
 *
 * Juega únicamente con su propia mano y la información pública de la mesa
 * (cartas jugadas, cantos, puntajes), igual que un jugador humano. Es
 * determinista: ante el mismo estado siempre elige la misma acción, lo que
 * permite pruebas reproducibles. La UI lo identifica como CPU.
 */
import {
  cardWeight,
  envidoValue,
  legalActions,
  other,
  type Action,
  type Card,
  type MatchState,
  type PlayerId,
} from './engine.js';

function maxWeight(hand: Card[]): number {
  return Math.max(...hand.map(cardWeight));
}

function countStrong(hand: Card[], threshold: number): number {
  return hand.filter((card) => cardWeight(card) >= threshold).length;
}

function lowestFirst(hand: Card[]): Card[] {
  return [...hand].sort(
    (a, b) => cardWeight(a) - cardWeight(b) || a.rank - b.rank,
  );
}

function chooseCard(state: MatchState, me: PlayerId): Action {
  const hand = state.hand;
  const mine = lowestFirst(hand.hands[me]);
  if (mine.length === 0) return { type: 'mazo' };
  const trickIndex = hand.trickWinners.length;
  const currentTrick = hand.played.slice(trickIndex * 2);
  const rivalPlay = currentTrick.find((play) => play.player !== me);

  if (!rivalPlay) {
    // Salgo: la más alta para forzar.
    const best = mine[mine.length - 1];
    return { type: 'play', card: `${best.rank}-${best.suit.slice(0, -1)}` };
  }
  const rivalWeight = cardWeight(rivalPlay.card);
  const winner = mine.find((card) => cardWeight(card) > rivalWeight);
  const chosen = winner ?? mine[0];
  return { type: 'play', card: `${chosen.rank}-${chosen.suit.slice(0, -1)}` };
}

function chooseResponse(
  state: MatchState,
  me: PlayerId,
  pending: NonNullable<MatchState['hand']['pending']>,
): Action {
  const hand = state.hand;
  const acts = legalActions(state, me);
  const has = (type: Action['type']): boolean =>
    acts.some((action) => action.type === type);

  if (
    pending.kind === 'truco' ||
    pending.kind === 'retruco' ||
    pending.kind === 'valeCuatro'
  ) {
    const mine = hand.hands[me];
    const strong = maxWeight(mine) >= 8 || countStrong(mine, 6) >= 2;
    return { type: strong ? 'quiero' : 'noQuiero' };
  }

  const value = envidoValue(hand.initialHands[me]);
  if (has('envido') && value >= 31 && pending.kind === 'envido') {
    return { type: 'envido' };
  }
  if (has('realEnvido') && value >= 32) {
    return { type: 'realEnvido' };
  }
  const threshold =
    pending.kind === 'faltaEnvido'
      ? 31
      : pending.kind === 'realEnvido'
        ? 29
        : 27;
  return { type: value >= threshold ? 'quiero' : 'noQuiero' };
}

/**
 * Elige la acción del bot. Siempre devuelve una acción legal;
 * lanza si el estado no tiene acciones para el bot (error de integración).
 */
export function chooseAction(state: MatchState, me: PlayerId): Action {
  const hand = state.hand;
  const acts = legalActions(state, me);
  if (acts.length === 0) {
    throw new Error('El bot no tiene acciones legales en este estado.');
  }
  const has = (type: Action['type']): Action | undefined =>
    acts.find((action) => action.type === type);

  if (hand.pending && other(hand.pending.by) === me) {
    return chooseResponse(state, me, hand.pending);
  }

  const mine = hand.hands[me];
  const opener = hand.trickWinners.length === 0 && hand.played.length === 0;

  const retruco = has('retruco');
  if (retruco && maxWeight(mine) >= 12) return retruco;
  const valeCuatro = has('valeCuatro');
  if (valeCuatro && maxWeight(mine) >= 13) return valeCuatro;

  if (opener) {
    const value = envidoValue(hand.initialHands[me]);
    if (value >= 30 && has('envido')) return { type: 'envido' };
    if (maxWeight(mine) >= 11 && has('truco')) return { type: 'truco' };
  }

  return chooseCard(state, me);
}
