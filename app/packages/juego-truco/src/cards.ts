/**
 * Baraja española de 40 cartas — reglamento v1, sección 1.
 * La lógica de juego completa llega en E3; aquí solo los datos
 * de la baraja que el motor necesita (cartas, no jerarquías).
 */

export const SUITS = ['oros', 'copas', 'espadas', 'bastos'] as const;
export type Suit = (typeof SUITS)[number];

/** Valores de la baraja de truco: 1–7, 10, 11, 12 (sin 8 ni 9). */
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Versión del reglamento que implementa este motor. */
export const RULES_VERSION = 'v1' as const;

/** Construye el mazo ordenado de 40 cartas. El reparto barajado llega en E3. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}
