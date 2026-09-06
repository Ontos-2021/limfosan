import { describe, expect, it } from 'vitest';
import { RANKS, RULES_VERSION, SUITS, buildDeck } from '../src/cards.js';

describe('baraja (reglamento v1, R1)', () => {
  it('tiene 4 palos y 10 valores (sin 8 ni 9)', () => {
    expect(SUITS).toHaveLength(4);
    expect([...RANKS]).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
  });

  it('construye un mazo de exactamente 40 cartas únicas', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(40);
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(40);
  });

  it('declara la versión del reglamento implementada', () => {
    expect(RULES_VERSION).toBe('v1');
  });
});
