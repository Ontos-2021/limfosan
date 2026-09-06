import { useEffect, useRef, useState, type ReactNode } from 'react';
import AccountDialog from './AccountDialog';
import Lobby from './Lobby';
import LocalTable from './LocalTable';
import OnlineTable from './OnlineTable';
import { useSession, SessionProvider } from './session';
import { SKIN_STORAGE_KEY, SkinProvider, type Skin } from './skin';
import { HelpContent } from './table-ui';
import { ToastProvider } from './toasts';

type Mode = 'local' | 'online';

function readUrl(): {
  mesa: string | null;
  verificar: string | null;
  nuevaClave: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const mesa = params.get('mesa');
  return {
    mesa: mesa && /^[A-Za-z0-9]{6}$/.test(mesa) ? mesa.toUpperCase() : null,
    verificar: params.get('verificar'),
    nuevaClave: params.get('nueva-clave'),
  };
}

function writeUrlMesa(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('mesa', code);
  else url.searchParams.delete('mesa');
  window.history.replaceState(null, '', url);
}

function VerifyScreen({
  token,
  onDone,
}: {
  token: string;
  onDone: () => void;
}) {
  const { verify } = useSession();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  useEffect(() => {
    verify(token).then(
      () => setState('ok'),
      () => setState('error'),
    );
  }, [token]);
  return (
    <main className="game-layout">
      <section className="game-column" aria-label="Verificar cuenta">
        <div className="lobby-card" role="status">
          <h1>
            {state === 'ok'
              ? '¡Cuenta verificada!'
              : state === 'error'
                ? 'Enlace inválido'
                : 'Verificando…'}
          </h1>
          <p>
            {state === 'ok'
              ? 'Tu email quedó confirmado. Ya podés jugar online.'
              : state === 'error'
                ? 'Ese enlace venció o ya se usó. Pedí uno nuevo desde tu cuenta.'
                : 'Confirmando tu email…'}
          </p>
          {state !== 'working' && (
            <button className="button button-primary" onClick={onDone}>
              Ir a jugar
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function ResetScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { reset } = useSession();
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'ok' | 'error'>('form');
  async function submit() {
    if (password.length < 10) {
      setState('error');
      return;
    }
    try {
      await reset(token, password);
      setState('ok');
    } catch {
      setState('error');
    }
  }
  return (
    <main className="game-layout">
      <section className="game-column" aria-label="Elegir nueva clave">
        <div className="lobby-card">
          <h1>Nueva clave</h1>
          {state === 'ok' ? (
            <>
              <p role="status">Listo. Iniciá sesión con tu nueva clave.</p>
              <button className="button button-primary" onClick={onDone}>
                Ir a jugar
              </button>
            </>
          ) : (
            <>
              <label className="form-field">
                <span>Clave nueva (mínimo 10 caracteres)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {state === 'error' && (
                <p className="form-error" role="alert">
                  No se pudo cambiar. Revisá la clave o pedí un enlace nuevo.
                </p>
              )}
              <button
                className="button button-primary"
                onClick={() => void submit()}
              >
                Guardar clave
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function LegalScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="game-layout">
      <section className="game-column" aria-label={title}>
        <div className="lobby-card">
          <span className="eyebrow">TRUQUITO</span>
          <h1>{title}</h1>
          {children}
          <div className="callout-actions">
            <a className="button button-primary" href="/">
              Ir a jugar
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function Terminos() {
  return (
    <LegalScreen title="Términos">
      <p>
        Truquito es truco argentino 1 vs. 1: contra la CPU en este dispositivo o
        en línea con un amigo por enlace privado.
      </p>
      <p>Sin apuestas ni premios. Sin chat libre: solo saludos predefinidos.</p>
      <p>
        Para crear una cuenta necesitás un código de invitación. El juego online
        requiere conexión; si se corta, tu lugar se guarda unos segundos y la
        partida puede darse por perdida si no volvés a tiempo.
      </p>
      <p>
        Si alguien molesta, usá «Reportar un problema» en la mesa: lo revisa una
        persona y puede terminar en bloqueo.
      </p>
    </LegalScreen>
  );
}

function Privacidad() {
  return (
    <LegalScreen title="Privacidad">
      <p>
        Como invitado, tu historial vive en este navegador. Con cuenta guardamos
        tu nombre visible, email y partidas en nuestro servidor para que puedas
        volver y recuperar tu clave.
      </p>
      <p>
        Nunca mostramos tus cartas al rival: el servidor solo le envía la
        cantidad de cartas y lo ya jugado. Los reportes guardan el código de
        mesa y el motivo que escribas; no agregues datos personales.
      </p>
      <p>
        Sin publicidad ni venta de datos. Escribinos si querés borrar tu cuenta.
      </p>
    </LegalScreen>
  );
}

function Shell() {
  const { me } = useSession();
  const [mode, setMode] = useState<Mode>(() =>
    readUrl().mesa ? 'online' : 'local',
  );
  const [onlineCode, setOnlineCode] = useState<string | null>(
    () => readUrl().mesa,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [skin, setSkin] = useState<Skin>(() =>
    localStorage.getItem(SKIN_STORAGE_KEY) === 'svg' ? 'svg' : 'png',
  );
  const helpDialog = useRef<HTMLDialogElement>(null);
  const accountDialog = useRef<HTMLDialogElement>(null);
  const url = readUrl();

  useEffect(() => {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  }, [skin]);

  useEffect(() => {
    if (helpOpen) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [helpOpen]);

  useEffect(() => {
    if (accountOpen) accountDialog.current?.showModal();
    else accountDialog.current?.close();
  }, [accountOpen]);

  const path = window.location.pathname;
  if (path === '/terminos') return <Terminos />;
  if (path === '/privacidad') return <Privacidad />;

  function goOnline(code: string | null = null) {
    setMode('online');
    setOnlineCode(code);
    writeUrlMesa(code);
  }

  function goLocal() {
    setMode('local');
    setOnlineCode(null);
    writeUrlMesa(null);
  }

  function clearTokenParams() {
    const next = new URL(window.location.href);
    next.searchParams.delete('verificar');
    next.searchParams.delete('nueva-clave');
    window.history.replaceState(null, '', next);
    goLocal();
  }

  const initial = me?.displayName?.trim().slice(0, 1).toUpperCase() || '•';

  return (
    <SkinProvider value={skin}>
      <div className="app-shell">
        <header className="site-header">
          <a className="wordmark" href="/" aria-label="Truquito, inicio">
            <span className="brand-mark" aria-hidden="true">
              t.
            </span>
            truquito<span className="brand-period">.</span>
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
            <button
              className="avatar-button"
              aria-label={me ? `Cuenta de ${me.displayName}` : 'Cuenta'}
              title={
                me
                  ? `${me.displayName} (${me.role === 'guest' ? 'invitado' : 'cuenta'})`
                  : 'Cuenta'
              }
              onClick={() => setAccountOpen(true)}
            >
              {initial}
            </button>
            <button
              className="icon-button"
              aria-label="Cómo jugar"
              onClick={() => setHelpOpen(true)}
            >
              ?
            </button>
          </div>
        </header>

        {url.verificar ? (
          <VerifyScreen token={url.verificar} onDone={clearTokenParams} />
        ) : url.nuevaClave ? (
          <ResetScreen token={url.nuevaClave} onDone={clearTokenParams} />
        ) : mode === 'local' ? (
          <LocalTable
            onGoOnline={() => goOnline()}
            onHelp={() => setHelpOpen(true)}
          />
        ) : onlineCode ? (
          <OnlineTable
            key={onlineCode}
            initialCode={onlineCode}
            onExit={() => goOnline(null)}
          />
        ) : (
          <Lobby onJoin={(code) => goOnline(code)} onExit={goLocal} />
        )}

        <footer className="site-footer">
          <span>Hecho para compartir una buena mano.</span>
          <span>
            {mode === 'local' ? 'Local vs CPU' : 'En línea'} · Sin apuestas ·{' '}
            <a href="/terminos">Términos</a> ·{' '}
            <a href="/privacidad">Privacidad</a>
          </span>
        </footer>

        <dialog
          ref={helpDialog}
          className="sheet"
          aria-labelledby="help-title"
          onCancel={() => setHelpOpen(false)}
          onClose={() => setHelpOpen(false)}
        >
          <div className="sheet-header">
            <span className="eyebrow">TRUQUITO / TRUCO</span>
            <button
              className="icon-button"
              aria-label="Cerrar"
              onClick={() => setHelpOpen(false)}
            >
              ×
            </button>
          </div>
          <h2 id="help-title">Cómo se juega.</h2>
          <HelpContent />
          <p className="help-disclaimer">
            {mode === 'local'
              ? 'Juegan vos contra la CPU con estas reglas. La CPU solo ve sus cartas y lo que ya se jugó, igual que vos.'
              : 'En línea jugás contra personas con estas mismas reglas. Nadie ve tus cartas hasta que las jugás.'}
          </p>
        </dialog>

        <dialog
          ref={accountDialog}
          className="sheet"
          aria-labelledby="account-title"
          onCancel={() => setAccountOpen(false)}
          onClose={() => setAccountOpen(false)}
        >
          <div className="sheet-header">
            <span className="eyebrow">TRUQUITO / CUENTA</span>
            <button
              className="icon-button"
              aria-label="Cerrar"
              onClick={() => setAccountOpen(false)}
            >
              ×
            </button>
          </div>
          <h2 id="account-title">Tu cuenta.</h2>
          {accountOpen && (
            <AccountDialog onClose={() => setAccountOpen(false)} />
          )}
        </dialog>
      </div>
    </SkinProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SessionProvider>
  );
}
