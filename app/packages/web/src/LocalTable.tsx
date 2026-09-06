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
  type CardId,
  type MatchState,
  type PlayerId,
} from '@limfosan/juego-truco';
import { CardBack } from './Card';
import {
  ActionBar,
  BidResponseDialog,
  EnvidoChoiceRow,
  HandCards,
  LeaveDialog,
  Scoreboard,
  TrickSlots,
  TurnStatus,
  bidWorthText,
} from './table-ui';

const ME: PlayerId = 'p0';
const BOT_DELAY_MS = 850;

type Panel = 'scenarios' | 'leave' | null;
type Overlay = { kind: 'envidoResult' } | { kind: 'matchEnd' } | null;

// Partida local real contra CPU: el motor decide qué es legal y cuántos
// puntos vale cada cosa. El rival es una heurística determinista que solo
// ve sus cartas y lo público (ver juego-truco/src/bot.ts).
export default function LocalTable({
  onGoOnline,
  onHelp,
}: {
  onGoOnline: () => void;
  onHelp: () => void;
}) {
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
    <>
      <a className="skip-link" href="#hand">
        Ir a mis cartas
      </a>
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

          <Scoreboard
            ariaLabel={`Marcador: vos ${match.scores[ME]}, CPU ${match.scores[other(ME)]}, a 30 puntos`}
            myName="Vos"
            myTag="LOCAL"
            myScore={match.scores[ME]}
            rivalName="CPU"
            rivalScore={match.scores[other(ME)]}
            target={30}
          />

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

            <TrickSlots slots={tricks} />

            <div className="table-signature" aria-hidden="true">
              Una mesa. Muchas historias.
            </div>
            <TurnStatus thinking={botThinking} heading={heading} />

            {uiMode === 'game' && responderIsMe && pending !== null && (
              <BidResponseDialog
                byLabel={pending.by === ME ? 'TU CANTO' : 'CANTO DE LA CPU'}
                kind={pending.kind}
                worthText={bidWorthText(match.scores, pending.kind)}
                raiseChoices={raiseChoices}
                onQuiero={() => act({ type: 'quiero' })}
                onNoQuiero={() => act({ type: 'noQuiero' })}
                onRaise={(kind) => act({ type: kind })}
              />
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
            {overlay?.kind === 'envidoResult' && envidoEvent !== undefined && (
              <div className="table-overlay">
                <div
                  className="callout"
                  role="dialog"
                  aria-label="Resultado del envido"
                >
                  <span className="eyebrow">TANTO VA</span>
                  <h2>
                    {envidoEvent.values[ME]} a {envidoEvent.values[other(ME)]}
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
            <HandCards
              cards={myCards}
              selectedId={selected}
              canPlay={canPlay}
              onSelect={setSelected}
            />
            <p className="move-notice" role="status" aria-live="polite">
              {currentCard
                ? `Elegiste el ${cardLabel(currentCard)}. Confirmá para jugar.`
                : notice}
            </p>
            <ActionBar
              truco={
                trucoAction === null
                  ? null
                  : { label: trucoLabel, points: trucoPoints }
              }
              onTruco={() => {
                if (trucoAction !== null) act({ type: trucoAction });
              }}
              envidoEnabled={has('envido')}
              onEnvido={() => setEnvidoChoice((open) => !open)}
              playDisabled={!canPlay || selected === null}
              onPlay={() => {
                if (selected !== null) act({ type: 'play', card: selected });
              }}
            />
            {envidoChoice && has('envido') && (
              <EnvidoChoiceRow onPick={(kind) => act({ type: kind })} />
            )}
            <div className="hand-footer">
              <button
                className="text-button"
                disabled={!has('mazo')}
                onClick={() => setPanel('leave')}
              >
                Ir al mazo
              </button>
              <button className="text-button" onClick={() => setGreeting(true)}>
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
            <button className="text-button" onClick={onHelp}>
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
            <button className="text-button" onClick={onGoOnline}>
              Jugar online con un amigo <span aria-hidden="true">↗</span>
            </button>
            <br />
            <button
              className="text-button"
              onClick={() => setPanel('scenarios')}
            >
              Ver estados de la mesa
            </button>
          </section>
        </aside>
      </main>
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
          {panel === 'leave' ? '¿Te vas al mazo?' : 'Cada momento, su lugar.'}
        </h2>
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
          <LeaveDialog
            points={preview.points}
            toName={preview.to === ME ? 'vos' : 'la CPU'}
            onStay={() => setPanel(null)}
            onLeave={() => {
              setPanel(null);
              act({ type: 'mazo' });
            }}
          />
        )}
      </dialog>
    </>
  );
}
