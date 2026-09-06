/**
 * Pruebas del motor contra docs/reglamento-truco-v1.md (casos R1–R36),
 * legalidad del bot y simulación masiva con acciones aleatorias.
 */
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/bot.js';
import { buildDeck } from '../src/cards.js';
import {
  applyAction,
  bidLabel,
  cardId,
  cardLabel,
  cardWeight,
  createCustomMatch,
  createMatch,
  envidoValue,
  legalActions,
  mazoPreview,
  mulberry32,
  other,
  type Action,
  type Card,
  type CardId,
  type PlayerId,
} from '../src/engine.js';

const play = (card: CardId): Action => ({ type: 'play', card });

function card(rank: number, suit: Card['suit']): Card {
  return { rank: rank as Card['rank'], suit };
}

describe('R1–R3: baraja, jerarquía y figuras', () => {
  it('R1: el mazo tiene 40 cartas únicas', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
  });

  it('R2: jerarquía completa de mayor a menor', () => {
    const order: Array<[number, Card['suit'], number]> = [
      [1, 'espadas', 13],
      [1, 'bastos', 12],
      [7, 'espadas', 11],
      [7, 'oros', 10],
      [3, 'oros', 9],
      [2, 'copas', 8],
      [1, 'oros', 7],
      [1, 'copas', 7],
      [12, 'bastos', 6],
      [11, 'espadas', 5],
      [10, 'oros', 4],
      [7, 'copas', 3],
      [7, 'bastos', 3],
      [6, 'oros', 2],
      [5, 'copas', 1],
      [4, 'espadas', 0],
    ];
    const weights = order.map(([rank, suit]) => cardWeight(card(rank, suit)));
    expect(weights).toEqual([
      13, 12, 11, 10, 9, 8, 7, 7, 6, 5, 4, 3, 3, 2, 1, 0,
    ]);
    // Empates entre palos: treses y doses iguales.
    expect(cardWeight(card(3, 'oros'))).toBe(cardWeight(card(3, 'copas')));
    expect(cardWeight(card(2, 'bastos'))).toBe(cardWeight(card(2, 'espadas')));
  });

  it('R25: ejemplos del reglamento', () => {
    const c = (rank: number, suit: Card['suit']): Card => ({
      rank: rank as Card['rank'],
      suit,
    });
    expect(envidoValue([c(7, 'espadas'), c(4, 'espadas'), c(6, 'oros')])).toBe(
      31,
    );
    expect(envidoValue([c(5, 'bastos'), c(12, 'bastos'), c(11, 'copas')])).toBe(
      25,
    );
    expect(envidoValue([c(6, 'bastos'), c(3, 'oros'), c(12, 'espadas')])).toBe(
      6,
    );
  });

  it('etiquetas e ids estables para la UI', () => {
    expect(cardId(card(1, 'espadas'))).toBe('1-espada');
    expect(cardLabel(card(7, 'oros'))).toBe('7 de oros');
    expect(bidLabel('valeCuatro')).toBe('¡Vale cuatro!');
  });
});

const HIGH33: CardId[] = ['7-oro', '6-oro', '4-copa'];
const LOW5: CardId[] = ['4-basto', '5-copa', '12-espada'];
const TOP: CardId[] = ['1-espada', '1-basto', '3-oro'];
const LOW4: CardId[] = ['4-copa', '4-basto', '4-oro'];

describe('R4–R8: bazas y pardas', () => {
  it('R4: mano sin cantar vale 1', () => {
    let s = createCustomMatch({
      hands: [LOW4, ['5-copa', '5-basto', '5-oro']],
    });
    s = applyAction(s, 'p0', play('4-copa'));
    s = applyAction(s, 'p1', play('5-copa'));
    s = applyAction(s, 'p1', play('5-basto'));
    s = applyAction(s, 'p0', play('4-basto'));
    expect(s.scores).toEqual({ p0: 0, p1: 1 });
    expect(s.hand.handNumber).toBe(2);
  });

  it('R5: parda + ganada cierra sin tercera baza', () => {
    let s = createCustomMatch({
      hands: [
        ['3-basto', '1-espada', '4-oro'],
        ['3-oro', '4-copa', '4-basto'],
      ],
    });
    s = applyAction(s, 'p0', play('3-basto'));
    s = applyAction(s, 'p1', play('3-oro'));
    expect(s.hand.trickWinners).toEqual(['parda']);
    s = applyAction(s, 'p0', play('1-espada'));
    s = applyAction(s, 'p1', play('4-copa'));
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
    expect(s.hand.handNumber).toBe(2);
    expect(s.lastEvent).toMatchObject({ kind: 'handEnd', handWinner: 'p0' });
  });

  it('R6/R8: triple parda la gana la mano', () => {
    let s = createCustomMatch({
      hands: [
        ['3-basto', '2-copa', '4-oro'],
        ['3-oro', '2-espada', '4-copa'],
      ],
    });
    for (const [a, b] of [
      ['3-basto', '3-oro'],
      ['2-copa', '2-espada'],
    ] as Array<[CardId, CardId]>) {
      s = applyAction(s, 'p0', play(a));
      s = applyAction(s, 'p1', play(b));
    }
    expect(s.hand.trickWinners).toEqual(['parda', 'parda']);
    s = applyAction(s, 'p0', play('4-oro'));
    s = applyAction(s, 'p1', play('4-copa'));
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
    expect(s.lastEvent).toMatchObject({ kind: 'handEnd', handWinner: 'p0' });
  });

  it('R7: 2 a 1 gana la mano', () => {
    let s = createCustomMatch({
      hands: [
        ['1-espada', '4-copa', '3-basto'],
        ['3-oro', '1-basto', '4-oro'],
      ],
    });
    s = applyAction(s, 'p0', play('1-espada'));
    s = applyAction(s, 'p1', play('3-oro'));
    s = applyAction(s, 'p0', play('4-copa'));
    s = applyAction(s, 'p1', play('1-basto'));
    s = applyAction(s, 'p1', play('4-oro'));
    s = applyAction(s, 'p0', play('3-basto'));
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
  });
});

describe('R9–R16: truco, retruco, vale cuatro y mazo', () => {
  it('R9: truco querido vale 2', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    s = applyAction(s, 'p0', play('1-espada'));
    s = applyAction(s, 'p1', play('4-copa'));
    s = applyAction(s, 'p0', play('1-basto'));
    s = applyAction(s, 'p1', play('4-basto'));
    expect(s.scores).toEqual({ p0: 2, p1: 0 });
  });

  it('R10: truco no querido suma 1 al cantor y cierra', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
    expect(s.hand.handNumber).toBe(2);
  });

  it('R11: solo quien aceptó puede retrucar', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(() => applyAction(s, 'p0', { type: 'retruco' })).toThrow();
    s = applyAction(s, 'p1', { type: 'retruco' });
    expect(s.hand.pending).toEqual({ kind: 'retruco', by: 'p1' });
  });

  it('R12–R14: retruco querido vale 3; vale cuatro querido vale 4', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    s = applyAction(s, 'p1', { type: 'retruco' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    // R13: el que cantó el retruco no puede subir a vale cuatro.
    expect(() => applyAction(s, 'p1', { type: 'valeCuatro' })).toThrow();
    s = applyAction(s, 'p0', { type: 'valeCuatro' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    s = applyAction(s, 'p0', play('1-espada'));
    s = applyAction(s, 'p1', play('4-copa'));
    s = applyAction(s, 'p0', play('1-basto'));
    s = applyAction(s, 'p1', play('4-basto'));
    expect(s.scores).toEqual({ p0: 4, p1: 0 });
  });

  it('R14: vale cuatro no querido suma 3 al cantor', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    s = applyAction(s, 'p1', { type: 'retruco' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    s = applyAction(s, 'p0', { type: 'valeCuatro' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 3, p1: 0 });
    expect(s.hand.handNumber).toBe(2);
  });

  it('R15: con canto pendiente no se puede tirar carta', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    expect(() => applyAction(s, 'p1', play('4-copa'))).toThrow();
  });

  it('R16: mazo con truco pendiente equivale a no quiero', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'mazo' });
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
    expect(s.hand.handNumber).toBe(2);
  });

  it('mazo sin cantos da 1 al rival; con truco querido da el valor aceptado', () => {
    expect(mazoPreview(createMatch(5), 'p0')).toEqual({ points: 1, to: 'p1' });
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(mazoPreview(s, 'p0')).toEqual({ points: 2, to: 'p1' });
    s = applyAction(s, 'p0', { type: 'mazo' });
    expect(s.scores).toEqual({ p0: 0, p1: 2 });
  });
});

describe('R17–R24: cadena de envido', () => {
  it('R17: envido querido vale 2; no querido vale 1', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 2, p1: 0 });
    expect(s.hand.envidoResolved).toBe(true);
    expect(s.lastEvent.envido).toMatchObject({
      values: { p0: 33, p1: 5 },
      winner: 'p0',
      points: 2,
    });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
  });

  it('R18: envido-envido querido vale 4; rechazado paga 2', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'envido' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 4, p1: 0 });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'envido' });
    s = applyAction(s, 'p0', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 0, p1: 2 });
  });

  it('R19: envido + real querido vale 5; rechazado paga 2', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 5, p1: 0 });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 0, p1: 2 });
  });

  it('R20: real directo querido vale 3; rechazado vale 1', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'realEnvido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 3, p1: 0 });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'realEnvido' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 1, p1: 0 });
  });

  it('R21: doble real querido vale 8; rechazado paga 5', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'realEnvido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 8, p1: 0 });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'realEnvido' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 5, p1: 0 });
  });

  it('R22: tercer envido inválido', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'envido' });
    expect(() => applyAction(s, 'p0', { type: 'envido' })).toThrow();
  });

  it('R23: real seguido de envido inválido', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'realEnvido' });
    expect(() => applyAction(s, 'p1', { type: 'envido' })).toThrow();
  });

  it('R24: envido cerrada la primera baza inválido', () => {
    let s = createCustomMatch({ hands: [TOP, LOW4] });
    s = applyAction(s, 'p0', play('1-espada'));
    s = applyAction(s, 'p1', play('4-copa'));
    expect(() => applyAction(s, 'p0', { type: 'envido' })).toThrow();
  });

  it('R26: empate de envido lo gana la mano', () => {
    const s0 = createCustomMatch({
      hands: [
        ['7-oro', '6-copa', '4-basto'],
        ['7-copa', '5-oro', '4-espada'],
      ],
    });
    let s = applyAction(s0, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.lastEvent.envido?.values).toEqual({ p0: 7, p1: 7 });
    expect(s.scores).toEqual({ p0: 2, p1: 0 });
  });
});

describe('R27–R31: falta envido al resto del puntero', () => {
  it('R27: 24–18, gana el de 18 y suma 6; rechazo paga 1', () => {
    let s = createCustomMatch({ hands: [LOW5, HIGH33], scores: [24, 18] });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 24, p1: 24 });

    s = createCustomMatch({ hands: [LOW5, HIGH33], scores: [24, 18] });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 25, p1: 18 });
  });

  it('R28: 29–17, si gana el puntero cierra; si gana el de atrás sigue', () => {
    let s = createCustomMatch({
      hands: [HIGH33, LOW5],
      scores: [29, 17],
      mano: 'p1',
    });
    s = applyAction(s, 'p1', { type: 'faltaEnvido' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 30, p1: 17 });
    expect(s.status).toBe('over');
    expect(s.winner).toBe('p0');

    s = createCustomMatch({ hands: [LOW5, HIGH33], scores: [29, 17] });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 29, p1: 18 });
    expect(s.status).toBe('playing');
  });

  it('R29: la falta querida sustituye lo acumulado', () => {
    let s = createCustomMatch({ hands: [LOW5, HIGH33], scores: [20, 20] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 20, p1: 30 });
    expect(s.winner).toBe('p1');
  });

  it('R30: falta rechazada tras subidas paga lo acumulado', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'realEnvido' });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    s = applyAction(s, 'p1', { type: 'noQuiero' });
    expect(s.scores).toEqual({ p0: 5, p1: 0 });
  });

  it('R31: la falta cierra la cadena', () => {
    let s = createCustomMatch({ hands: [LOW5, HIGH33] });
    s = applyAction(s, 'p0', { type: 'faltaEnvido' });
    expect(() => applyAction(s, 'p1', { type: 'realEnvido' })).toThrow();
    expect(() => applyAction(s, 'p1', { type: 'envido' })).toThrow();
  });
});

describe('R32–R36: prioridad, cierre, mano y validez', () => {
  it('R32: el envido puede cerrar la partida con truco pendiente', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5], scores: [29, 17] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'envido' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    expect(s.status).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.scores).toEqual({ p0: 31, p1: 17 });
    expect(s.hand.played).toHaveLength(0);
  });

  it('R33: resuelto el envido, se responde el truco pendiente', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'truco' });
    s = applyAction(s, 'p1', { type: 'envido' });
    s = applyAction(s, 'p0', { type: 'quiero' });
    expect(s.scores).toEqual({ p0: 2, p1: 0 });
    expect(s.hand.pending).toEqual({ kind: 'truco', by: 'p0' });
    const acts = legalActions(s, 'p1').map((a) => a.type);
    expect(acts).toContain('quiero');
    expect(acts).toContain('noQuiero');
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.hand.trucoLevel).toBe(1);
  });

  it('R34: cerrada la partida no se tiran más cartas', () => {
    let s = createCustomMatch({ hands: [HIGH33, LOW5], scores: [29, 17] });
    s = applyAction(s, 'p0', { type: 'envido' });
    s = applyAction(s, 'p1', { type: 'quiero' });
    expect(s.status).toBe('over');
    expect(() => applyAction(s, 'p0', play('7-oro'))).toThrow();
  });

  it('R35: la mano alterna al finalizar cada mano', () => {
    let s = createMatch(11);
    expect(s.hand.mano).toBe('p0');
    s = applyAction(s, 'p0', { type: 'mazo' });
    expect(s.hand.mano).toBe('p1');
    expect(s.hand.handNumber).toBe(2);
    s = applyAction(s, 'p1', { type: 'mazo' });
    expect(s.hand.mano).toBe('p0');
    expect(s.hand.handNumber).toBe(3);
  });

  it('R36: la acción ilegal no muta el estado', () => {
    const s = createCustomMatch({ hands: [TOP, LOW4] });
    const snapshot = structuredClone(s);
    expect(() => applyAction(s, 'p0', { type: 'retruco' })).toThrow();
    expect(s).toEqual(snapshot);
    expect(() => applyAction(s, 'p0', play('7-oro'))).toThrow();
    expect(s).toEqual(snapshot);
  });

  it('carta ajena o inexistente siempre es ilegal', () => {
    const s = createCustomMatch({ hands: [TOP, LOW4] });
    expect(() => applyAction(s, 'p0', play('4-copa'))).toThrow();
    expect(() => applyAction(s, 'p1', play('1-espada'))).toThrow();
  });
});

describe('bot local', () => {
  it('responde quiero con mano fuerte y no quiero con mano débil', () => {
    let s = createCustomMatch({
      hands: [
        ['4-copa', '4-basto', '4-oro'],
        ['1-espada', '3-oro', '5-copa'],
      ],
    });
    s = applyAction(s, 'p0', { type: 'truco' });
    expect(chooseAction(s, 'p1')).toEqual({ type: 'quiero' });

    s = createCustomMatch({
      hands: [
        ['1-espada', '1-basto', '3-oro'],
        ['4-copa', '4-basto', '5-oro'],
      ],
    });
    s = applyAction(s, 'p0', { type: 'truco' });
    expect(chooseAction(s, 'p1')).toEqual({ type: 'noQuiero' });
  });

  it('responde el envido según sus puntos (y sube con 31+)', () => {
    let s = createCustomMatch({ hands: [LOW5, HIGH33] });
    s = applyAction(s, 'p0', { type: 'envido' });
    expect(chooseAction(s, 'p1')).toEqual({ type: 'envido' });

    s = createCustomMatch({
      hands: [LOW5, ['6-oro', '4-oro', '12-copa']],
    });
    s = applyAction(s, 'p0', { type: 'envido' });
    expect(chooseAction(s, 'p1')).toEqual({ type: 'quiero' });

    s = createCustomMatch({ hands: [HIGH33, LOW5] });
    s = applyAction(s, 'p0', { type: 'envido' });
    expect(chooseAction(s, 'p1')).toEqual({ type: 'noQuiero' });
  });

  it('es determinista y siempre legal', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = createMatch(seed);
      for (let step = 0; step < 200 && s.status === 'playing'; step++) {
        const actor =
          s.hand.pending != null ? other(s.hand.pending.by) : s.hand.toPlay;
        const legal = legalActions(s, actor);
        expect(legal.length).toBeGreaterThan(0);
        const action =
          actor === 'p1'
            ? chooseAction(s, actor)
            : legal[
                Math.floor(mulberry32(seed * 7919 + step)() * legal.length)
              ];
        expect(legal).toContainEqual(action);
        if (actor === 'p1') {
          expect(chooseAction(s, actor)).toEqual(action);
        }
        s = applyAction(s, actor, action);
      }
      expect(s.status).toBe('over');
    }
  });
});

describe('simulación masiva', () => {
  it('1500 partidas aleatorias terminan sin estados inválidos', () => {
    let totalHands = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      let s = createMatch(seed);
      const rnd = mulberry32(seed);
      let prevScores = { p0: 0, p1: 0 };
      for (let step = 0; step < 500 && s.status === 'playing'; step++) {
        const actor =
          s.hand.pending != null ? other(s.hand.pending.by) : s.hand.toPlay;
        const legal = legalActions(s, actor);
        expect(legal.length).toBeGreaterThan(0);
        const action = legal[Math.floor(rnd() * legal.length)];
        s = applyAction(s, actor, action);
        expect(s.scores.p0).toBeGreaterThanOrEqual(prevScores.p0);
        expect(s.scores.p1).toBeGreaterThanOrEqual(prevScores.p1);
        prevScores = { ...s.scores };
      }
      expect(s.status).toBe('over');
      expect(s.winner).not.toBeNull();
      expect(s.scores[s.winner as PlayerId]).toBeGreaterThanOrEqual(30);
      totalHands += s.hand.handNumber;
    }
    expect(totalHands).toBeGreaterThan(5000);
  }, 120000);
});
