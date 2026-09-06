import { useEffect, useRef, useState } from 'react';
import {
  TRUCO_WORTH,
  bidLabel,
  cardId,
  cardLabel,
  other,
  type CardId,
} from '@limfosan/juego-truco';
import type { Action, MatchSnapshot, PlayerId } from '@limfosan/shared';
import { api } from './api';
import { CardBack } from './Card';
import { useSession } from './session';
import {
  BidResponseDialog,
  EnvidoChoiceRow,
  HandCards,
  LeaveDialog,
  Scoreboard,
  TrickSlots,
  TurnStatus,
  bidWorthText,
} from './table-ui';
import { useOnlineMatch } from './useOnlineMatch';
import { useToasts } from './toasts';

type Panel = 'leave' | 'report' | 'exit' | null;

function formatCountdown(deadlineAt: number, now: number): string {
  const left = Math.max(0, Math.ceil((deadlineAt - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function setUrlMesa(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('mesa', code);
  else url.searchParams.delete('mesa');
  window.history.replaceState(null, '', url);
}

/**
 * Mesas online montadas. En desarrollo, StrictMode monta-desmonta-monta
 * sincrónicamente: sin este conteo, el cleanup llamaría a leave() (con
 * disconnect) en medio del handshake y mataría la conexión real.
 */
let mountedTables = 0;

/** Mesa online: pinta snapshots del servidor; toda la lógica vive ahí. */
export default function OnlineTable({
  initialCode,
  onExit,
}: {
  initialCode: string;
  onExit: () => void;
}) {
  const { me, status: sessionStatus } = useSession();
  const { push } = useToasts();
  const [selected, setSelected] = useState<CardId | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [envidoChoice, setEnvidoChoice] = useState(false);
  const [dismissedEnvidoSeq, setDismissedEnvidoSeq] = useState(-1);
  const [reportReason, setReportReason] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [greetingMine, setGreetingMine] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const rematchButton = useRef<HTMLButtonElement>(null);

  const online = useOnlineMatch((newCode) => {
    push('¡Revancha aceptada! Entrando a la mesa nueva.');
    setSelected(null);
    setDismissedEnvidoSeq(-1);
    setUrlMesa(newCode);
    onlineRef.current?.join(newCode);
  });
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const code = online.code;
  useEffect(() => {
    // Esperar a tener identidad (el invitado se crea solo al cargar).
    if (sessionStatus !== 'ready') return;
    mountedTables += 1;
    online.join(initialCode);
    return () => {
      mountedTables -= 1;
      setTimeout(() => {
        if (mountedTables === 0) onlineRef.current?.leave();
      }, 150);
    };
  }, [initialCode, sessionStatus]);

  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!greetingMine) return;
    const timer = setTimeout(() => setGreetingMine(false), 2400);
    return () => clearTimeout(timer);
  }, [greetingMine]);

  const snap: MatchSnapshot | null = online.snapshot;
  const mySeat: PlayerId = snap?.me.seat ?? 'p0';
  const rivalSeat: PlayerId = other(mySeat);
  const rival = snap?.seats.find((s) => s.seat === rivalSeat) ?? null;
  const rivalName = rival?.name ?? 'Rival';

  useEffect(() => {
    if (!snap) return;
    if (selected && !snap.hand.myCards.some((c) => cardId(c) === selected)) {
      setSelected(null);
    }
    if (!snap.allowed.some((a) => a.type === 'envido')) setEnvidoChoice(false);
  }, [snap, selected]);

  useEffect(() => {
    if (snap?.result) rematchButton.current?.focus();
  }, [snap?.result]);

  if (sessionStatus === 'offline') {
    return (
      <main className="game-layout">
        <section className="game-column" aria-label="Sin conexión">
          <div className="table-heading">
            <div>
              <span className="eyebrow">EN LÍNEA</span>
              <h1>Sin conexión.</h1>
            </div>
          </div>
          <div className="lobby-card" role="alert">
            <p>
              No pudimos hablar con el servidor. Revisá tu conexión y probá de
              nuevo.
            </p>
            <div className="callout-actions">
              <button className="button button-light" onClick={onExit}>
                Volver
              </button>
              <button
                className="button button-primary"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!snap || !code || online.connection === 'joining') {
    return (
      <main className="game-layout">
        <section className="game-column" aria-label="Uniéndose a la mesa">
          <div className="table-heading">
            <div>
              <span className="eyebrow">EN LÍNEA</span>
              <h1>Entrando…</h1>
            </div>
          </div>
          <div className="lobby-card" role="status">
            <p>Conectando con la mesa {code ?? initialCode}…</p>
          </div>
          <button className="text-button" onClick={onExit}>
            ← Volver
          </button>
        </section>
      </main>
    );
  }

  if (online.connection === 'error') {
    return (
      <main className="game-layout">
        <section className="game-column" aria-label="Error al unirse">
          <div className="table-heading">
            <div>
              <span className="eyebrow">EN LÍNEA</span>
              <h1>No pudimos entrar.</h1>
            </div>
          </div>
          <div className="lobby-card" role="alert">
            <p>{online.error ?? 'Error desconocido.'}</p>
            <div className="callout-actions">
              <button className="button button-light" onClick={onExit}>
                Volver
              </button>
              <button
                className="button button-primary"
                onClick={() => online.join(code)}
              >
                Reintentar
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const acts = snap.allowed;
  const has = (type: Action['type']): boolean =>
    online.connection === 'connected' &&
    acts.some((action) => action.type === type);
  const pending = snap.hand.pending;
  const responderIsMe = pending !== null && pending.by !== mySeat;
  const canPlay = has('play');
  const myCards = snap.hand.myCards;
  const worth = TRUCO_WORTH[snap.hand.trucoLevel];
  const playing = snap.table.status === 'playing';
  const waiting = snap.table.status === 'waiting';
  const finished = snap.table.status === 'finished';
  const myTurn = playing && snap.hand.toPlay === mySeat;
  const thinking = playing && !responderIsMe && snap.hand.toPlay !== mySeat;

  const currentCard = myCards.find((card) => cardId(card) === selected);
  const tricks = [0, 1, 2].map((index) => {
    const pair = snap.hand.played.slice(index * 2, index * 2 + 2);
    return {
      mine: pair.find((play) => play.player === mySeat)?.card,
      rival: pair.find((play) => play.player !== mySeat)?.card,
    };
  });
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
  const envidoEvent = snap.lastEvent.envido;
  const showEnvidoOverlay =
    snap.lastEvent.kind === 'envidoResult' &&
    envidoEvent !== undefined &&
    snap.seq !== dismissedEnvidoSeq;

  const heading = waiting
    ? 'Esperando rival…'
    : online.connection === 'reconnecting'
      ? 'Volvemos en un momento'
      : finished
        ? snap.result?.winner === mySeat
          ? '¡Ganaste!'
          : `Ganó ${rivalName}`
        : pending !== null
          ? responderIsMe
            ? bidLabel(pending.kind)
            : 'Esperando respuesta…'
          : myTurn
            ? 'Tu turno'
            : `Turno de ${rivalName}`;

  const shareUrl = `${window.location.origin}/?mesa=${code}`;

  function act(action: Action) {
    online.sendAction(action);
    setSelected(null);
    setEnvidoChoice(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `Sumate a mi mesa de Truquito: ${shareUrl}`,
      );
      push('Enlace copiado. ¡Compartilo!');
    } catch {
      push('No se pudo copiar. El código es ' + code, 'error');
    }
  }

  async function sendReport() {
    if (reportReason.trim().length < 3) {
      push('Contanos brevemente qué pasó.', 'error');
      return;
    }
    try {
      await api.post('/api/reportes', {
        tableCode: code,
        reason: reportReason.trim().slice(0, 500),
      });
      setPanel(null);
      setReportReason('');
      push('Reporte enviado. Lo revisamos a la brevedad.');
    } catch {
      push('No se pudo enviar el reporte.', 'error');
    }
  }

  return (
    <>
      <a className="skip-link" href="#hand">
        Ir a mis cartas
      </a>
      <main className="game-layout">
        <section className="game-column" aria-label="Mesa de Truco en línea">
          <div className="table-heading">
            <div>
              <span className="eyebrow">EN LÍNEA · MESA {code}</span>
              <h1>Un buen truco.</h1>
            </div>
            <button className="text-button scenario-button" onClick={onExit}>
              Salir <span aria-hidden="true">↗</span>
            </button>
          </div>

          <Scoreboard
            ariaLabel={`Marcador: ${snap.me.name} ${snap.scores[mySeat]}, ${rivalName} ${snap.scores[rivalSeat]}, a 30 puntos`}
            myName="Vos"
            myTag={snap.me.name.toUpperCase().slice(0, 12)}
            myScore={snap.scores[mySeat]}
            rivalName={rivalName}
            rivalScore={snap.scores[rivalSeat]}
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
                aria-label={`Rival (${rivalName}): ${snap.hand.rivalCount} cartas ocultas`}
              >
                {Array.from({ length: snap.hand.rivalCount }, (_, index) => (
                  <CardBack key={index} />
                ))}
              </div>
              <span className="opponent-caption">
                {rivalName}{' '}
                <span
                  className={`presence-dot ${rival?.online === false ? 'offline' : ''}`}
                  role="img"
                  aria-label={
                    rival?.online === false ? 'desconectado' : 'en línea'
                  }
                />
              </span>
              {(greetingMine || online.greeting) && (
                <span className="greeting" role="status">
                  {online.greeting?.text ?? '¡Buena mano!'}
                </span>
              )}
            </div>

            <TrickSlots slots={tricks} />

            <div className="table-signature" aria-hidden="true">
              Una mesa. Muchas historias.
            </div>
            <TurnStatus thinking={thinking} heading={heading} />
            {playing && snap.timers && (
              <p className="timer-line" aria-live="off">
                {snap.timers.seat === mySeat ? 'Te quedan ' : `${rivalName}: `}
                {formatCountdown(snap.timers.deadlineAt, now)}
              </p>
            )}

            {waiting && (
              <div className="table-overlay">
                <div
                  className="callout"
                  role="dialog"
                  aria-label="Esperando rival"
                >
                  <span className="eyebrow">MESA {code}</span>
                  <h2>Esperando rival…</h2>
                  <p>
                    Compartí este enlace: quien lo abra se sienta a jugar. La
                    partida arranca sola.
                  </p>
                  <div className="callout-actions">
                    <button className="button button-light" onClick={onExit}>
                      Cancelar
                    </button>
                    <button
                      className="button button-primary"
                      onClick={() => void copyLink()}
                    >
                      Copiar enlace
                    </button>
                  </div>
                </div>
              </div>
            )}
            {playing && responderIsMe && pending !== null && (
              <BidResponseDialog
                byLabel={`CANTO DE ${rivalName.toUpperCase()}`}
                kind={pending.kind}
                worthText={bidWorthText(snap.scores, pending.kind)}
                raiseChoices={raiseChoices}
                onQuiero={() => act({ type: 'quiero' })}
                onNoQuiero={() => act({ type: 'noQuiero' })}
                onRaise={(kind) => act({ type: kind })}
              />
            )}
            {online.connection === 'reconnecting' && (
              <div className="table-overlay">
                <div className="callout" role="alert">
                  <span className="connection-glyph" aria-hidden="true">
                    ↻
                  </span>
                  <h2>Tu lugar sigue acá.</h2>
                  <p>
                    Se cortó la conexión. Estamos reconectando y tu lugar se
                    guarda unos segundos.
                  </p>
                </div>
              </div>
            )}
            {showEnvidoOverlay && envidoEvent !== undefined && (
              <div className="table-overlay">
                <div
                  className="callout"
                  role="dialog"
                  aria-label="Resultado del envido"
                >
                  <span className="eyebrow">TANTO VA</span>
                  <h2>
                    {envidoEvent.values[mySeat]} a{' '}
                    {envidoEvent.values[rivalSeat]}
                  </h2>
                  <p>
                    {envidoEvent.winner === mySeat
                      ? `Ganaste el envido (+${envidoEvent.points}).`
                      : `${rivalName} ganó el envido (+${envidoEvent.points}).`}
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => setDismissedEnvidoSeq(snap.seq)}
                  >
                    Continuar
                  </button>
                </div>
              </div>
            )}
            {finished && snap.result && (
              <div className="table-overlay">
                <div
                  className="callout result-callout"
                  role="dialog"
                  aria-label="Fin de la partida"
                >
                  <span className="eyebrow">FIN DE LA PARTIDA</span>
                  <h2>
                    {snap.result.winner === mySeat ? (
                      <>
                        ¡Ganaste,
                        <br />
                        {snap.scores[mySeat]} a {snap.scores[rivalSeat]}!
                      </>
                    ) : (
                      <>
                        Ganó {rivalName},
                        <br />
                        {snap.scores[rivalSeat]} a {snap.scores[mySeat]}.
                      </>
                    )}
                  </h2>
                  <p>
                    {snap.result.reason === 'abandono'
                      ? snap.result.winner === mySeat
                        ? `${rivalName} abandonó la partida.`
                        : 'Abandonaste la partida.'
                      : 'Una más, ¿no? Siempre hay lugar para la revancha.'}
                  </p>
                  {snap.rematch.newCode ? (
                    <p role="status">¡Revancha aceptada! Entrando…</p>
                  ) : snap.rematch.votes.includes(mySeat) ? (
                    <p role="status">Revancha pedida. Esperando al rival…</p>
                  ) : (
                    <button
                      ref={rematchButton}
                      className="button button-primary"
                      onClick={() => online.voteRematch()}
                    >
                      Pedir revancha <span aria-hidden="true">↗</span>
                    </button>
                  )}
                  <div className="callout-actions">
                    <button className="button button-light" onClick={onExit}>
                      Salir
                    </button>
                  </div>
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
                : snap.lastEvent.summary}
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
                  if (selected !== null) act({ type: 'play', card: selected });
                }}
              >
                Jugar carta <span aria-hidden="true">↑</span>
              </button>
            </div>
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
              <button
                className="text-button"
                onClick={() => {
                  online.sendGreeting('¡Buena mano!');
                  setGreetingMine(true);
                }}
              >
                Decir «¡Buena mano!»
              </button>
            </div>
          </section>
        </section>

        <aside className="side-panel" aria-label="Acerca de esta mesa">
          <div className="intro-note">
            <span className="eyebrow">PARTIDA EN LÍNEA · {code}</span>
            <h2>
              {rivalName}
              <br />
              está {rival?.online === false ? 'ausente' : 'en la mesa'}.
            </h2>
            <p>
              {playing
                ? 'Cada jugada la valida el servidor. Si te desconectás, tu lugar se guarda unos segundos.'
                : finished
                  ? 'La partida terminó. Podés pedir la revancha o salir.'
                  : 'Compartí el enlace para que se siente tu rival.'}
            </p>
          </div>
          <section className="demo-note">
            <span className="demo-label">
              {online.connection === 'connected'
                ? 'CONECTADO'
                : online.connection === 'reconnecting'
                  ? 'RECONECTANDO'
                  : 'EN LÍNEA'}
            </span>
            <p className="backend-status">
              {me ? `Jugás como ${me.displayName}.` : ''} Las cartas viajan
              cifradas por tu conexión y el rival nunca ve tu mano.
            </p>
            <button className="text-button" onClick={() => void copyLink()}>
              Copiar enlace de invitación
            </button>
            <br />
            <button className="text-button" onClick={() => setPanel('report')}>
              Reportar un problema
            </button>
            <br />
            <button className="text-button" onClick={onExit}>
              ← Volver a jugar contra la CPU
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
          <span className="eyebrow">TRUQUITO / TRUCO</span>
          <button
            className="icon-button"
            aria-label="Cerrar"
            onClick={() => setPanel(null)}
          >
            ×
          </button>
        </div>
        <h2 id="sheet-title">
          {panel === 'leave'
            ? '¿Te vas al mazo?'
            : panel === 'report'
              ? 'Reportar un problema'
              : 'Salir de la mesa'}
        </h2>
        {panel === 'leave' && snap.mazo !== null && (
          <LeaveDialog
            points={snap.mazo.points}
            toName={snap.mazo.to === mySeat ? 'vos' : rivalName}
            onStay={() => setPanel(null)}
            onLeave={() => {
              setPanel(null);
              act({ type: 'mazo' });
            }}
          />
        )}
        {panel === 'report' && (
          <div className="leave-content">
            <p>
              Contanos qué pasó en esta mesa. Lo revisa una persona; no hace
              falta que escribas datos personales.
            </p>
            <label className="form-field">
              <span>Motivo</span>
              <input
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Ej: el rival insulta"
                maxLength={500}
              />
            </label>
            <div className="callout-actions">
              <button
                className="button button-light"
                onClick={() => setPanel(null)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                onClick={() => void sendReport()}
              >
                Enviar reporte
              </button>
            </div>
          </div>
        )}
        {panel === 'exit' && (
          <div className="leave-content">
            <p>
              {playing
                ? 'Si salís ahora, la partida en curso se da por perdida.'
                : 'Vas a salir de esta mesa.'}{' '}
              ¿Seguro?
            </p>
            <div className="callout-actions">
              <button
                className="button button-light"
                onClick={() => setPanel(null)}
              >
                Seguir
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  setPanel(null);
                  online.leave();
                  onExit();
                }}
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
