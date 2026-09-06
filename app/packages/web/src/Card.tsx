import {
  SUITS,
  cardId,
  cardLabel,
  type Rank,
  type Suit,
} from '@limfosan/juego-truco';
import type { Card } from '@limfosan/juego-truco';
import { CardSvg } from './deck';
import { useSkin } from './skin';

export interface DemoCard {
  id: string;
  suit: Suit;
  rank: Rank;
  label: string;
}

export function toCardView(card: Card): DemoCard {
  return {
    id: cardId(card),
    suit: card.suit,
    rank: card.rank,
    label: cardLabel(card),
  };
}

/**
 * El PNG heredado existe para 36 de las 40 cartas: faltan los dieces.
 * En la baraja clásica esos cuatro 10 se dibujan con el SVG propio.
 */
const PNG_IDS: ReadonlySet<string> = new Set(
  SUITS.flatMap((suit) =>
    [1, 2, 3, 4, 5, 6, 7, 11, 12].map((rank) => `${rank}-${suit.slice(0, -1)}`),
  ),
);

export function pngAvailable(id: string): boolean {
  return PNG_IDS.has(id);
}

export function CardFace({ card }: { card: DemoCard }) {
  const skin = useSkin();
  if (skin === 'png' && pngAvailable(card.id)) {
    return (
      <img
        className="card-face"
        src={`/cards/${card.id}.png`}
        alt={card.label}
        width="208"
        height="319"
        draggable={false}
      />
    );
  }
  return <CardSvg suit={card.suit} rank={card.rank} label={card.label} />;
}

export function CardBack() {
  return (
    <span className="card-back" aria-hidden="true">
      <span className="card-back-mark">M</span>
    </span>
  );
}
