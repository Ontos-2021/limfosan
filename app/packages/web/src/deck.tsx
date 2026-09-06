/**
 * Baraja española propia en SVG (40 cartas, reglamento v1 §1–§2).
 *
 * Diseño paramétrico y 100% original: sin imágenes heredadas, sin derechos
 * de terceros. Mantiene la API visual (misma caja y proporción) para que un
 * futuro arte encargado pueda reemplazarla sin tocar el juego.
 */
import type { Rank, Suit } from '@limfosan/juego-truco';

const SUIT_COLORS: Record<Suit, { main: string; dark: string; tint: string }> =
  {
    oros: { main: '#c19a1b', dark: '#8a6d0e', tint: '#f4e8c4' },
    copas: { main: '#b6452f', dark: '#7e2f20', tint: '#f3d9d2' },
    espadas: { main: '#2f5b8a', dark: '#1e3d5f', tint: '#d6e2ef' },
    bastos: { main: '#4c7a3f', dark: '#33552b', tint: '#d9e7d2' },
  };

const FIGURE_LETTER: Partial<Record<Rank, string>> = {
  10: 'S',
  11: 'C',
  12: 'R',
};

function SuitGlyph({ suit }: { suit: Suit }) {
  const c = SUIT_COLORS[suit];
  if (suit === 'oros') {
    return (
      <g>
        <circle r="14" fill={c.main} stroke={c.dark} strokeWidth="2.5" />
        <circle
          r="8.5"
          fill="none"
          stroke={c.dark}
          strokeWidth="1.6"
          opacity="0.75"
        />
        <circle cx="-4" cy="-5" r="2.4" fill="#f7ecc8" opacity="0.9" />
      </g>
    );
  }
  if (suit === 'copas') {
    return (
      <g stroke={c.dark} strokeWidth="2.5" fill={c.main} strokeLinejoin="round">
        <path d="M -11 -13 L 11 -13 C 11 -2 6 3 0 3 C -6 3 -11 -2 -11 -13 Z" />
        <rect x="-2" y="3" width="4" height="9" fill={c.dark} stroke="none" />
        <path d="M -8 14 L 8 14" strokeLinecap="round" />
      </g>
    );
  }
  if (suit === 'espadas') {
    return (
      <g>
        <polygon
          points="0,-15 4.5,-8 2,-8 2,5 -2,5 -2,-8 -4.5,-8"
          fill={c.main}
          stroke={c.dark}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <rect x="-9" y="5" width="18" height="4.4" rx="2.2" fill={c.dark} />
        <rect x="-2.2" y="9" width="4.4" height="6" rx="2" fill={c.dark} />
        <circle
          cy="17"
          r="2.6"
          fill={c.main}
          stroke={c.dark}
          strokeWidth="1.4"
        />
      </g>
    );
  }
  return (
    <g stroke={c.dark} strokeWidth="4.6" strokeLinecap="round">
      <line x1="-8" y1="-11" x2="8" y2="11" stroke={c.main} />
      <line x1="8" y1="-11" x2="-8" y2="11" stroke={c.main} />
      <line x1="-8" y1="-11" x2="8" y2="11" opacity="0.35" />
      <rect
        x="-8"
        y="-2.4"
        width="16"
        height="4.8"
        rx="2.4"
        fill={c.dark}
        stroke="none"
      />
    </g>
  );
}

const PIPS: Partial<Record<Rank, Array<[number, number, number]>>> = {
  1: [[100, 158, 2.4]],
  2: [
    [100, 100, 1],
    [100, 206, 1],
  ],
  3: [
    [100, 84, 1],
    [100, 153, 1],
    [100, 222, 1],
  ],
  4: [
    [68, 102, 1],
    [132, 102, 1],
    [68, 204, 1],
    [132, 204, 1],
  ],
  5: [
    [68, 102, 1],
    [132, 102, 1],
    [100, 153, 1],
    [68, 204, 1],
    [132, 204, 1],
  ],
  6: [
    [68, 88, 1],
    [132, 88, 1],
    [68, 153, 1],
    [132, 153, 1],
    [68, 218, 1],
    [132, 218, 1],
  ],
  7: [
    [68, 92, 1],
    [132, 92, 1],
    [68, 157, 1],
    [132, 157, 1],
    [68, 222, 1],
    [132, 222, 1],
    [100, 50, 0.9],
  ],
};

function CornerIndex({ suit, rank }: { suit: Suit; rank: Rank }) {
  return (
    <g>
      <text
        x="28"
        y="48"
        textAnchor="middle"
        fontSize="30"
        fontWeight="800"
        fill="#25392e"
        fontFamily="system-ui, sans-serif"
      >
        {rank}
      </text>
      <g transform="translate(28 68) scale(0.62)">
        <SuitGlyph suit={suit} />
      </g>
      <g transform="rotate(180 100 150)">
        <text
          x="28"
          y="48"
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fill="#25392e"
          fontFamily="system-ui, sans-serif"
        >
          {rank}
        </text>
        <g transform="translate(28 68) scale(0.62)">
          <SuitGlyph suit={suit} />
        </g>
      </g>
      {/* marca de agua del palo, solo decorativa */}
      <g transform="translate(100 262) scale(0.5)" opacity="0.28">
        <SuitGlyph suit={suit} />
      </g>
    </g>
  );
}

function Figure({ suit, rank }: { suit: Suit; rank: Rank }) {
  const c = SUIT_COLORS[suit];
  return (
    <g>
      <rect
        x="48"
        y="76"
        width="104"
        height="150"
        rx="12"
        fill={c.tint}
        stroke={c.dark}
        strokeWidth="2.5"
      />
      <text
        x="100"
        y="172"
        textAnchor="middle"
        fontSize="72"
        fill={c.dark}
        fontFamily="'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
      >
        {FIGURE_LETTER[rank]}
      </text>
      <g transform="translate(100 205) scale(1.05)">
        <SuitGlyph suit={suit} />
      </g>
    </g>
  );
}

export function CardSvg({
  suit,
  rank,
  label,
}: {
  suit: Suit;
  rank: Rank;
  label: string;
}) {
  const pips = PIPS[rank];
  return (
    <svg
      className="card-face"
      viewBox="0 0 200 300"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <rect
        x="4"
        y="4"
        width="192"
        height="292"
        rx="14"
        fill="#fffdf6"
        stroke="#ddd5bd"
        strokeWidth="2"
      />
      <rect
        x="13"
        y="13"
        width="174"
        height="274"
        rx="9"
        fill="none"
        stroke="#e7e1cd"
        strokeWidth="1.5"
      />
      <CornerIndex suit={suit} rank={rank} />
      {pips !== undefined ? (
        <g>
          {pips.map(([x, y, scale], index) => (
            <g key={index} transform={`translate(${x} ${y}) scale(${scale})`}>
              <SuitGlyph suit={suit} />
            </g>
          ))}
        </g>
      ) : (
        <Figure suit={suit} rank={rank} />
      )}
    </svg>
  );
}
