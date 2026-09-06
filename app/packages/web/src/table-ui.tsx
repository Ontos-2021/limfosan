import {
  bidLabel,
  cardId,
  cardLabel,
  type Card,
  type PendingKind,
  type PlayerId,
} from '@limfosan/juego-truco';
import { CardFace, toCardView } from './Card';

export function malasBuenas(score: number): string {
  if (score === 1) return '1 mala';
  if (score < 15) return `${score} malas`;
  if (score === 15) return 'buenas';
  return `${score - 15} buenas`;
}

export function bidWorthText(
  scores: Record<PlayerId, number>,
  kind: PendingKind,
): string {
  switch (kind) {
    case 'truco':
      return 'Si aceptás, la mano vale 2 puntos.';
    case 'retruco':
      return 'Si aceptás, la mano vale 3 puntos.';
    case 'valeCuatro':
      return 'Si aceptás, la mano vale 4 puntos.';
    case 'envido':
      return 'Vale 2 puntos.';
    case 'realEnvido':
      return 'Vale 3 puntos.';
    case 'faltaEnvido': {
      const resto = 30 - Math.max(scores.p0, scores.p1);
      return `Vale ${resto} (el resto del puntero).`;
    }
  }
}

export function Scoreboard(props: {
  ariaLabel: string;
  myName: string;
  myTag: string | null;
  myScore: number;
  rivalName: string;
  rivalScore: number;
  target: number;
}) {
  return (
    <section className="scoreboard" aria-label={props.ariaLabel}>
      <div className="score-player">
        <span className="mini-avatar you-avatar">V</span>
        <div>
          <span className="player-name">
            {props.myName}{' '}
            {props.myTag ? (
              <span className="player-tag">{props.myTag}</span>
            ) : null}
          </span>
          <span className="score-caption">{malasBuenas(props.myScore)}</span>
        </div>
        <strong>{props.myScore}</strong>
      </div>
      <div className="score-target">
        <span>A</span>
        <strong>{props.target}</strong>
        <span>PUNTOS</span>
      </div>
      <div className="score-player opponent-score">
        <strong>{props.rivalScore}</strong>
        <div>
          <span className="player-name">{props.rivalName}</span>
          <span className="score-caption">{malasBuenas(props.rivalScore)}</span>
        </div>
        <span className="mini-avatar rival-avatar">
          {props.rivalName.slice(0, 1).toUpperCase()}
        </span>
      </div>
    </section>
  );
}

export interface TrickSlot {
  mine?: Card;
  rival?: Card;
}

export function TrickSlots({ slots }: { slots: TrickSlot[] }) {
  return (
    <div className="tricks" aria-label="Cartas jugadas en esta mano">
      {[0, 1, 2].map((index) => (
        <div
          className={`trick ${(slots[index].mine ?? slots[index].rival) ? 'trick-played' : ''}`}
          key={index}
        >
          <span className="trick-label">{index + 1}ª BAZA</span>
          <div className="card-slot opponent-slot">
            {slots[index].rival ? (
              <CardFace card={toCardView(slots[index].rival as Card)} />
            ) : (
              <span className="slot-symbol" aria-hidden="true">
                ✦
              </span>
            )}
          </div>
          <div className="card-slot own-slot">
            {slots[index].mine ? (
              <CardFace card={toCardView(slots[index].mine as Card)} />
            ) : (
              <span className="slot-symbol" aria-hidden="true">
                ✦
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TurnStatus({
  thinking,
  heading,
}: {
  thinking: boolean;
  heading: string;
}) {
  return (
    <div className="turn-status" role="status" aria-live="polite">
      <span
        className={`status-dot ${thinking ? 'thinking' : ''}`}
        aria-hidden="true"
      />
      <strong>{heading}</strong>
    </div>
  );
}

export function HandCards(props: {
  cards: Card[];
  selectedId: string | null;
  canPlay: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="hand-cards">
      {props.cards.map((card) => {
        const id = cardId(card);
        return (
          <button
            key={id}
            className={`hand-card ${props.selectedId === id ? 'is-selected' : ''}`}
            disabled={!props.canPlay}
            aria-label={`Seleccionar ${cardLabel(card)}`}
            aria-pressed={props.selectedId === id}
            onClick={() => {
              props.onSelect(props.selectedId === id ? null : id);
            }}
          >
            <CardFace card={toCardView(card)} />
            <span className="selection-check" aria-hidden="true">
              ✓
            </span>
          </button>
        );
      })}
      {props.cards.length === 0 && (
        <p className="empty-hand">Todas tus cartas están sobre la mesa.</p>
      )}
    </div>
  );
}

export function ActionBar(props: {
  truco: { label: string; points: number } | null;
  onTruco: () => void;
  envidoEnabled: boolean;
  onEnvido: () => void;
  playDisabled: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="action-bar">
      <button
        className="button button-secondary bid-button"
        disabled={props.truco === null}
        onClick={props.onTruco}
      >
        {props.truco?.label ?? 'Truco'}{' '}
        <span className="action-points">{props.truco?.points ?? 2}</span>
      </button>
      <button
        className="button button-secondary"
        disabled={!props.envidoEnabled}
        onClick={props.onEnvido}
      >
        Envido
      </button>
      <button
        className="button button-primary play-button"
        disabled={props.playDisabled}
        onClick={props.onPlay}
      >
        Jugar carta <span aria-hidden="true">↑</span>
      </button>
    </div>
  );
}

export function EnvidoChoiceRow(props: {
  onPick: (kind: 'envido' | 'realEnvido' | 'faltaEnvido') => void;
}) {
  return (
    <div
      className="action-bar"
      role="group"
      aria-label="Elegir canto de envido"
    >
      <button
        className="button button-secondary"
        onClick={() => props.onPick('envido')}
      >
        Envido <span className="action-points">2</span>
      </button>
      <button
        className="button button-secondary"
        onClick={() => props.onPick('realEnvido')}
      >
        Real <span className="action-points">3</span>
      </button>
      <button
        className="button button-secondary"
        onClick={() => props.onPick('faltaEnvido')}
      >
        Falta <span className="action-points">resto</span>
      </button>
    </div>
  );
}

export function BidResponseDialog(props: {
  byLabel: string;
  kind: PendingKind;
  worthText: string;
  raiseChoices: Array<{
    type: 'envido' | 'realEnvido' | 'faltaEnvido';
    label: string;
  }>;
  onQuiero: () => void;
  onNoQuiero: () => void;
  onRaise: (kind: 'envido' | 'realEnvido' | 'faltaEnvido') => void;
}) {
  return (
    <div className="table-overlay">
      <div
        className="callout bid-callout"
        role="dialog"
        aria-label="Responder canto"
      >
        <span className="eyebrow">{props.byLabel}</span>
        <h2>{bidLabel(props.kind)}</h2>
        <p>{props.worthText}</p>
        <div className="callout-actions">
          <button className="button button-light" onClick={props.onNoQuiero}>
            No quiero
          </button>
          <button className="button button-primary" onClick={props.onQuiero}>
            ¡Quiero!
          </button>
        </div>
        {props.raiseChoices.length > 0 && (
          <div className="callout-actions">
            {props.raiseChoices.map((choice) => (
              <button
                key={choice.type}
                className="button button-secondary"
                onClick={() => props.onRaise(choice.type)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LeaveDialog(props: {
  points: number;
  toName: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="leave-content">
      <p>
        Irte al mazo le da <strong>+{props.points}</strong> a {props.toName}. La
        mano termina acá.
      </p>
      <div className="callout-actions">
        <button className="button button-light" onClick={props.onStay}>
          Seguir jugando
        </button>
        <button className="button button-primary" onClick={props.onLeave}>
          Ir al mazo
        </button>
      </div>
    </div>
  );
}

export function HelpContent() {
  return (
    <div className="help-content">
      <p>Truco argentino, de a dos, a 30 puntos y sin flor.</p>
      <h3>Las cartas mandan</h3>
      <p>
        De mayor a menor: 1 de espadas, 1 de bastos, 7 de espadas, 7 de oros,
        treses, doses, ases falsos, 12, 11, 10, sietes falsos, 6, 5 y 4.
      </p>
      <h3>Los cantos</h3>
      <dl>
        <div>
          <dt>Sin cantar</dt>
          <dd>1 punto</dd>
        </div>
        <div>
          <dt>Truco / Retruco / Vale cuatro</dt>
          <dd>2 / 3 / 4 puntos</dd>
        </div>
        <div>
          <dt>Envido</dt>
          <dd>2 puntos</dd>
        </div>
        <div>
          <dt>Real envido</dt>
          <dd>3 puntos</dd>
        </div>
        <div>
          <dt>Falta envido</dt>
          <dd>el resto del puntero</dd>
        </div>
      </dl>
    </div>
  );
}
