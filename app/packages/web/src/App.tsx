import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TRUCO_WORTH,
  applyAction,
  bidLabel,
  cardId,
  cardLabel,
  chooseAction,
  createMatch,
  legalActions,
  mazoPreview,
  other,
  type Action,
  type Card,
  type CardId,
  type MatchState,
  type PlayerId,
} from '@limfosan/juego-truco';
import { CardBack, CardFace, type DemoCard } from './Card';
import { SKIN_STORAGE_KEY, SkinProvider, type Skin } from './skin';

const ME: PlayerId = 'p0';
const BOT_DELAY_MS = 850;

type Panel = 'help' | 'scenarios' | 'leave' | null;
type Overlay = { kind: 'envidoResult' } | { kind: 'matchEnd' } | null;

function toDemo(card: Card): DemoCard {
  return {
    id: cardId(card),
    suit: card.suit,
    rank: card.rank,
    label: cardLabel(card),
  };
}

function malasBuenas(score: number): string {
  if (score === 1) return '1 mala';
  if (score < 15) return `${score} malas`;
  if (score === 15) return 'buenas';
  return `${score - 15} buenas`;
}

function bidWorthText(match: MatchState, kind: string): string {
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
      const resto = match.target - Math.max(match.scores.p0, match.scores.p1);
      return `Vale ${resto} (el resto del puntero).`;
    }
    default:
      return '';
  }
}

// Partida local real contra CPU: el motor decide qué es legal y cuántos
// puntos vale cada cosa. El rival es una heurística determinista que solo
// ve sus cartas y lo público (ver juego-truco/src/bot.ts).
export default function App() {
  const seed = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('seed');
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : Date.now() % 2147483647;
  }, []);
  const [match, setMatch] = useState<MatchState>(() => createMatch(seed));
  const [selected, setSelected] = useState<CardId | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [uiMode, setUiMode] = useState<'game' | 'reconnect'>('game');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [envidoChoice, setEnvidoChoice] = useState(false);
  const [notice, setNotice] = useState(match.lastEvent.summary);
  const [backend, setBackend] = useState('Comprobando servicio…');
  const [greeting, setGreeting] = useState(false);
  const [skin, setSkin] = useState<Skin>(() =>
    localStorage.getItem(SKIN_STORAGE_KEY) === 'svg' ? 'svg' : 'png',
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const rematchButton = useRef<HTMLButtonElement>(null);

  const acts = match.status === 'playing' ? legalActions(match, ME) : [];
  // En modo reconexión la partida está "en pausa": ninguna acción es disponible.
  const has = (type: Action['type']): boolean =>
    uiMode === 'game' && acts.some((action) => action.type === type);
  const pending = match.hand.pending;
  const responderIsMe = pending !== null && other(pending.by) === ME;
  const canPlay = has('play');
  const myCards = match.hand.hands[ME];
  const rivalHidden = match.hand.hands[other(ME)].length;
  const worth = TRUCO_WORTH[match.hand.trucoLevel];
  const botThinking =
    match.status === 'playing' &&
    uiMode === 'game' &&
    (pending !== null
      ? other(pending.by) === other(ME)
      : match.hand.toPlay === other(ME));

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== 'object' ||
          !('app' in body) ||
          body.app !== 'truco'
        ) {
          throw new Error('wrong application');
        }
        setBackend('Servicio disponible · partida local');
      })
      .catch(() => setBackend('Sin servicio · partida local disponible'))
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);

  useEffect(() => {
    setNotice(match.lastEvent.summary);
    const kind = match.lastEvent.kind;
    if (kind === 'envidoResult') setOverlay({ kind: 'envidoResult' });
    else if (kind === 'matchEnd') setOverlay({ kind: 'matchEnd' });
    else setOverlay(null);
  }, [match]);

  useEffect(() => {
    if (!has('envido')) setEnvidoChoice(false);
  }, [match]);

  useEffect(() => {
    if (!botThinking) return;
    const timer = setTimeout(() => {
      setMatch((prev) => {
        if (prev.status !== 'playing' || uiMode !== 'game') return prev;
        const turn =
          prev.hand.pending !== null
            ? other(prev.hand.pending.by) === other(ME)
            : prev.hand.toPlay === other(ME);
        if (!turn) return prev;
        try {
          return applyAction(prev, other(ME), chooseAction(prev, other(ME)));
        } catch {
          return prev;
        }
      });
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [match, uiMode, botThinking]);

  useEffect(() => {
    if (overlay?.kind === 'matchEnd') rematchButton.current?.focus();
  }, [overlay]);

  useEffect(() => {
    if (!greeting) return;
    const timer = setTimeout(() => setGreeting(false), 2400);
    return () => clearTimeout(timer);
  }, [greeting]);

  useEffect(() => {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  }, [skin]);

  function act(action: Action) {
    setMatch((prev) => {
      try {
        return applyAction(prev, ME, action);
      } catch {
        return prev;
      }
    });
    setSelected(null);
    setEnvidoChoice(false);
  }

  function newMatch() {
    setMatch(createMatch(Date.now() % 2147483647));
    setSelected(null);
    setOverlay(null);
    setEnvidoChoice(false);
    setUiMode('game');
    setPanel(null);
  }

  const currentCard = myCards.find((card) => cardId(card) === selected);
  const tricks = [0, 1, 2].map((index) => {
    const pair = match.hand.played.slice(index * 2, index * 2 + 2);
    return {
      mine: pair.find((play) => play.player === ME)?.card,
      rival: pair.find((play) => play.player !== ME)?.card,
    };
  });
  const preview = has('mazo') ? mazoPreview(match, ME) : null;
  const trucoAction: Action['type'] | null = has('valeCuatro')
    ? 'valeCuatro'
    : has('retruco')
      ? 'retruco'
      : has('truco')
        ? 'truco'
        : null;
  const trucoLabel =
    trucoAction === 'valeCuatro'
      ? 'Vale cuatro'
      : trucoAction === 'retruco'
        ? 'Retruco'
        : 'Truco';
  const trucoPoints =
    trucoAction === 'valeCuatro' ? 4 : trucoAction === 'retruco' ? 3 : 2;
  const allRaises: Array<{
    type: 'envido' | 'realEnvido' | 'faltaEnvido';
    label: string;
  }> = [
    { type: 'envido', label: 'Envido' },
    { type: 'realEnvido', label: 'Real envido' },
    { type: 'faltaEnvido', label: 'Falta envido' },
  ];
  const raiseChoices = allRaises.filter((choice) => has(choice.type));
  const envidoEvent = match.lastEvent.envido;
  const heading =
    uiMode === 'reconnect'
      ? 'Volvemos en un momento'
      : match.status === 'over'
        ? match.winner === ME
          ? '¡Ganaste!'
          : 'Ganó la CPU'
        : pending !== null
          ? responderIsMe
            ? bidLabel(pending.kind)
            : 'Esperando respuesta…'
          : botThinking
            ? 'La CPU está pensando…'
            : match.hand.toPlay === ME
              ? 'Tu turno'
              : 'Turno de la CPU';

  return (
    <SkinProvider value={skin}>
      <div className="app-shell">
        <a className="skip-link" href="#hand">
          Ir a mis cartas
        </a>
        <header className="site-header">
          <a className="wordmark" href="/" aria-label="Mesa, inicio">
            <span className="brand-mark" aria-hidden="true">
              m.
            </span>
            mesa<span className="brand-period">.</span>
          </a>
          <span className="header-tagline">Las cartas nos juntan.</span>
          <div className="header-actions">
            <button
              className="skin-toggle"
              aria-label={
                skin === 'png'
                  ? 'Baraja clásica. Cambiar a la baraja propia'
                  : 'Baraja propia. Cambiar a la baraja clásica'
              }
              onClick={() => setSkin(skin === 'png' ? 'svg' : 'png')}
            >
              {skin === 'png' ? 'Clásica' : 'Propia'}
            </button>
            <span className="demo-label">Local vs CPU</span>
            <button
              className="icon-button"
              aria-label="Cómo jugar"
              onClick={() => setPanel('help')}
            >
              ?
            </button>
          </div>
        </header>

        <main className="game-layout">
          <section className="game-column" aria-label="Mesa de Truco">
            <div className="table-heading">
              <div>
                <span className="eyebrow">EL DE SIEMPRE, DONDE ESTÉS</span>
                <h1>Un buen truco.</h1>
              </div>
              <button
                className="text-button scenario-button"
                onClick={() => setPanel('scenarios')}
              >
                Explorar estados <span aria-hidden="true">↗</span>
              </button>
            </div>

            <section
              className="scoreboard"
              aria-label={`Marcador: vos ${match.scores[ME]}, CPU ${match.scores[other(ME)]}, a 30 puntos`}
            >
              <div className="score-player">
                <span className="mini-avatar you-avatar">V</span>
                <div>
                  <span className="player-name">
                    Vos <span className="player-tag">LOCAL</span>
                  </span>
                  <span className="score-caption">
                    {malasBuenas(match.scores[ME])}
                  </span>
                </div>
                <strong>{match.scores[ME]}</strong>
              </div>
              <div className="score-target">
                <span>A</span>
                <strong>30</strong>
                <span>PUNTOS</span>
              </div>
              <div className="score-player opponent-score">
                <strong>{match.scores[other(ME)]}</strong>
                <div>
                  <span className="player-name">CPU</span>
                  <span className="score-caption">
                    {malasBuenas(match.scores[other(ME)])}
                  </span>
                </div>
                <span className="mini-avatar rival-avatar">C</span>
              </div>
            </section>

            <section className="felt" aria-label="Paño de juego">
              <div className="felt-top">
                <span className="table-rule">
                  1 vs. 1 <span aria-hidden="true">·</span> Sin flor
                </span>
                <span className="stake">
                  Mano: {worth} {worth === 1 ? 'punto' : 'puntos'}
                </span>
              </div>
              <div className="opponent-zone">
                <div
                  className="opponent-hand"
                  role="img"
                  aria-label={`Rival (CPU): ${rivalHidden} cartas ocultas`}
                >
                  {Array.from({ length: rivalHidden }, (_, index) => (
                    <CardBack key={index} />
                  ))}
                </div>
                <span className="opponent-caption">
                  CPU <span className="small-dot" aria-hidden="true" />
                </span>
                {greeting && (
                  <span className="greeting" role="status">
                    ¡Buena mano!
                  </span>
                )}
              </div>

              <div className="tricks" aria-label="Cartas jugadas en esta mano">
                {[0, 1, 2].map((index) => (
                  <div
                    className={`trick ${(tricks[index].mine ?? tricks[index].rival) ? 'trick-played' : ''}`}
                    key={index}
                  >
                    <span className="trick-label">{index + 1}ª BAZA</span>
                    <div className="card-slot opponent-slot">
                      {tricks[index].rival ? (
                        <CardFace card={toDemo(tricks[index].rival)} />
                      ) : (
                        <span className="slot-symbol" aria-hidden="true">
                          ✦
                        </span>
                      )}
                    </div>
                    <div className="card-slot own-slot">
                      {tricks[index].mine ? (
                        <CardFace card={toDemo(tricks[index].mine)} />
                      ) : (
                        <span className="slot-symbol" aria-hidden="true">
                          ✦
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="table-signature" aria-hidden="true">
                Una mesa. Muchas historias.
              </div>
              <div className="turn-status" role="status" aria-live="polite">
                <span
                  className={`status-dot ${botThinking ? 'thinking' : ''}`}
                  aria-hidden="true"
                />
                <strong>{heading}</strong>
              </div>

              {uiMode === 'game' && responderIsMe && pending !== null && (
                <div className="table-overlay">
                  <div
                    className="callout bid-callout"
                    role="dialog"
                    aria-label="Responder canto"
                  >
                    <span className="eyebrow">
                      {pending.by === ME ? 'TU CANTO' : 'CANTO DE LA CPU'}
                    </span>
                    <h2>{bidLabel(pending.kind)}</h2>
                    <p>{bidWorthText(match, pending.kind)}</p>
                    <div className="callout-actions">
                      <button
                        className="button button-light"
                        onClick={() => act({ type: 'noQuiero' })}
                      >
                        No quiero
                      </button>
                      <button
                        className="button button-primary"
                        onClick={() => act({ type: 'quiero' })}
                      >
                        ¡Quiero!
                      </button>
                    </div>
                    {raiseChoices.length > 0 && (
                      <div className="callout-actions">
                        {raiseChoices.map((choice) => (
                          <button
                            key={choice.type}
                            className="button button-secondary"
                            onClick={() => act({ type: choice.type })}
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {uiMode === 'reconnect' && (
                <div className="table-overlay">
                  <div className="callout">
                    <span className="connection-glyph" aria-hidden="true">
                      ↻
                    </span>
                    <h2>Tu lugar sigue acá.</h2>
                    <p>
                      Así se verá una reconexión cuando haya juego en red. Esta
                      partida es local: no se perdió nada.
                    </p>
                    <button
                      className="button button-primary"
                      onClick={() => setUiMode('game')}
                    >
                      Simular regreso
                    </button>
                  </div>
                </div>
              )}
              {overlay?.kind === 'envidoResult' &&
                envidoEvent !== undefined && (
                  <div className="table-overlay">
                    <div
                      className="callout"
                      role="dialog"
                      aria-label="Resultado del envido"
                    >
                      <span className="eyebrow">TANTO VA</span>
                      <h2>
                        {envidoEvent.values[ME]} a{' '}
                        {envidoEvent.values[other(ME)]}
                      </h2>
                      <p>
                        {envidoEvent.winner === ME
                          ? `Ganaste el envido (+${envidoEvent.points}).`
                          : `La CPU ganó el envido (+${envidoEvent.points}).`}
                      </p>
                      <button
                        className="button button-primary"
                        onClick={() => setOverlay(null)}
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                )}
              {overlay?.kind === 'matchEnd' && (
                <div className="table-overlay">
                  <div
                    className="callout result-callout"
                    role="dialog"
                    aria-label="Fin de la partida"
                  >
                    <span className="eyebrow">FIN DE LA PARTIDA</span>
                    <h2>
                      {match.winner === ME ? (
                        <>
                          ¡Ganaste,
                          <br />
                          {match.scores[ME]} a {match.scores[other(ME)]}!
                        </>
                      ) : (
                        <>
                          Ganó la CPU,
                          <br />
                          {match.scores[other(ME)]} a {match.scores[ME]}.
                        </>
                      )}
                    </h2>
                    <p>Una más, ¿no? Siempre hay lugar para la revancha.</p>
                    <button
                      ref={rematchButton}
                      className="button button-primary"
                      onClick={newMatch}
                    >
                      Nueva partida <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section
              className="hand-zone"
              id="hand"
              tabIndex={-1}
              aria-label="Tu mano"
            >
              <div className="hand-heading">
                <span>
                  <strong>Tu mano</strong>{' '}
                  <span className="hand-count">{myCards.length} cartas</span>
                </span>
                <span className="hand-hint">
                  {canPlay ? 'Elegí y confirmá' : 'Esperá para jugar'}
                </span>
              </div>
              <div className="hand-cards">
                {myCards.map((card) => {
                  const id = cardId(card);
                  return (
                    <button
                      key={id}
                      className={`hand-card ${selected === id ? 'is-selected' : ''}`}
                      disabled={!canPlay}
                      aria-label={`Seleccionar ${cardLabel(card)}`}
                      aria-pressed={selected === id}
                      onClick={() => {
                        setSelected(selected === id ? null : id);
                      }}
                    >
                      <CardFace card={toDemo(card)} />
                      <span className="selection-check" aria-hidden="true">
                        ✓
                      </span>
                    </button>
                  );
                })}
                {myCards.length === 0 && (
                  <p className="empty-hand">
                    Todas tus cartas están sobre la mesa.
                  </p>
                )}
              </div>
              <p className="move-notice" role="status" aria-live="polite">
                {currentCard
                  ? `Elegiste el ${cardLabel(currentCard)}. Confirmá para jugar.`
                  : notice}
              </p>
              <div className="action-bar">
                <button
                  className="button button-secondary bid-button"
                  disabled={trucoAction === null}
                  onClick={() => {
                    if (trucoAction !== null) act({ type: trucoAction });
                  }}
                >
                  {trucoLabel}{' '}
                  <span className="action-points">{trucoPoints}</span>
                </button>
                <button
                  className="button button-secondary"
                  disabled={!has('envido')}
                  onClick={() => setEnvidoChoice((open) => !open)}
                >
                  Envido
                </button>
                <button
                  className="button button-primary play-button"
                  disabled={!canPlay || selected === null}
                  onClick={() => {
                    if (selected !== null)
                      act({ type: 'play', card: selected });
                  }}
                >
                  Jugar carta <span aria-hidden="true">↑</span>
                </button>
              </div>
              {envidoChoice && has('envido') && (
                <div
                  className="action-bar"
                  role="group"
                  aria-label="Elegir canto de envido"
                >
                  <button
                    className="button button-secondary"
                    onClick={() => act({ type: 'envido' })}
                  >
                    Envido <span className="action-points">2</span>
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => act({ type: 'realEnvido' })}
                  >
                    Real <span className="action-points">3</span>
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => act({ type: 'faltaEnvido' })}
                  >
                    Falta <span className="action-points">resto</span>
                  </button>
                </div>
              )}
              <div className="hand-footer">
                <button
                  className="text-button"
                  disabled={!has('mazo')}
                  onClick={() => setPanel('leave')}
                >
                  Ir al mazo
                </button>
                <button
                  className="text-button"
                  onClick={() => setGreeting(true)}
                >
                  Decir «¡Buena mano!»
                </button>
              </div>
            </section>
          </section>

          <aside className="side-panel" aria-label="Acerca de esta mesa">
            <div className="intro-note">
              <span className="eyebrow">NOS ENCONTRAMOS EN LA MESA</span>
              <h2>
                El gusto de
                <br />
                jugar juntos.
              </h2>
              <p>
                Un ancho, una buena charla y las ganas de pedir revancha. Lo
                importante nunca cambió.
              </p>
              <div className="ornament" aria-hidden="true">
                ✦
              </div>
            </div>
            <section className="guide-note">
              <span className="eyebrow">LA MESA, EN TRES PASOS</span>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Elegí tu carta</strong>
                    <p>Tocala para verla seleccionada.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Jugá con intención</strong>
                    <p>Confirmá la carta o probá un canto.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Pedí la revancha</strong>
                    <p>Siempre hay lugar para otra mano.</p>
                  </div>
                </li>
              </ol>
              <button className="text-button" onClick={() => setPanel('help')}>
                Consultar la guía <span aria-hidden="true">↗</span>
              </button>
            </section>
            <section className="demo-note">
              <span className="demo-label">PARTIDA LOCAL</span>
              <p>
                Jugás contra la CPU en este dispositivo, con el reglamento v1.
                Todavía no hay juego en red ni cuentas.
              </p>
              <p className="backend-status">{backend}</p>
              <button
                className="text-button"
                onClick={() => setPanel('scenarios')}
              >
                Ver estados de la mesa
              </button>
            </section>
          </aside>
        </main>

        <footer className="site-footer">
          <span>Hecho para compartir una buena mano.</span>
          <span>Local vs CPU · Sin apuestas · Sin registro</span>
        </footer>
        <dialog
          ref={dialog}
          className="sheet"
          aria-labelledby="sheet-title"
          onCancel={() => setPanel(null)}
          onClose={() => setPanel(null)}
        >
          <div className="sheet-header">
            <span className="eyebrow">MESA / TRUCO</span>
            <button
              className="icon-button"
              aria-label="Cerrar"
              onClick={() => setPanel(null)}
            >
              ×
            </button>
          </div>
          <h2 id="sheet-title">
            {panel === 'help'
              ? 'Un poco de cancha.'
              : panel === 'leave'
                ? '¿Te vas al mazo?'
                : 'Cada momento, su lugar.'}
          </h2>
          {panel === 'help' && (
            <div className="help-content">
              <p>Truco argentino, de a dos, a 30 puntos y sin flor.</p>
              <h3>Las cartas mandan</h3>
              <p>
                De mayor a menor: 1 de espadas, 1 de bastos, 7 de espadas, 7 de
                oros, treses, doses, ases falsos, 12, 11, 10, sietes falsos, 6,
                5 y 4.
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
                  <dt>Envido querido</dt>
                  <dd>2 puntos</dd>
                </div>
                <div>
                  <dt>Real envido querido</dt>
                  <dd>3 puntos</dd>
                </div>
                <div>
                  <dt>Falta envido</dt>
                  <dd>el resto del puntero</dd>
                </div>
              </dl>
              <p className="help-disclaimer">
                Juegan vos contra la CPU con estas reglas. La CPU solo ve sus
                cartas y lo que ya se jugó, igual que vos.
              </p>
            </div>
          )}
          {panel === 'scenarios' && (
            <div className="scenario-list">
              <p>La partida sigue su curso; esto solo cambia la vista.</p>
              <button
                onClick={() => {
                  setPanel(null);
                  setUiMode('reconnect');
                }}
              >
                <strong>Reconexión</strong>
                <span>
                  Cómo se verá un corte de red cuando haya juego online.
                </span>
              </button>
              <button onClick={newMatch}>
                <strong>Reiniciar partida</strong>
                <span>Repartir de nuevo desde cero, 0 a 0.</span>
              </button>
            </div>
          )}
          {panel === 'leave' && preview !== null && (
            <div className="leave-content">
              <p>
                Irte al mazo le da <strong>+{preview.points}</strong> a{' '}
                {preview.to === ME ? 'vos' : 'la CPU'}. La mano termina acá.
              </p>
              <div className="callout-actions">
                <button
                  className="button button-light"
                  onClick={() => setPanel(null)}
                >
                  Seguir jugando
                </button>
                <button
                  className="button button-primary"
                  onClick={() => {
                    setPanel(null);
                    act({ type: 'mazo' });
                  }}
                >
                  Ir al mazo
                </button>
              </div>
            </div>
          )}
        </dialog>
      </div>
    </SkinProvider>
  );
}
