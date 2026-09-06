import { useState } from 'react';
import { ApiError } from './api';
import { useSession } from './session';
import { useToasts } from './toasts';

type View = 'main' | 'login' | 'register' | 'forgot';

function friendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Algo falló. Reintentá.';
  switch (err.code) {
    case 'invite_required':
      return 'Necesitás un código de invitación.';
    case 'invite_invalid':
      return 'Ese código no es válido.';
    case 'email_en_uso':
      return 'Ese email ya tiene cuenta. Iniciá sesión.';
    case 'credenciales_invalidas':
      return 'Email o clave incorrectos.';
    case 'rate_limited':
      return 'Demasiados intentos. Esperá un minuto.';
    case 'invalid_input':
      return 'Revisá los datos (nombre, email y clave de 10+ caracteres).';
    default:
      return 'Algo falló. Reintentá.';
  }
}

/** Contenido del diálogo de cuenta (el <dialog> lo maneja App). */
export default function AccountDialog({ onClose }: { onClose: () => void }) {
  const { me, status, login, register, logout, updateName, forgot } =
    useSession();
  const { push } = useToasts();
  const [view, setView] = useState<View>('main');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (status === 'loading') return <p>Conectando…</p>;
  if (status === 'offline' || !me) {
    return (
      <div>
        <p>Sin conexión con el servidor. La partida local sigue disponible.</p>
        <div className="callout-actions">
          <button className="button button-light" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const isGuest = me.role === 'guest';

  return (
    <div className="account-content">
      {view === 'main' && (
        <>
          <p>
            {isGuest ? (
              <>
                Jugás como invitado <strong>{me.displayName}</strong>. Tu
                historial vive en este navegador.
              </>
            ) : (
              <>
                <strong>{me.displayName}</strong> · {me.email}{' '}
                {me.emailVerified ? '(verificado)' : '(sin verificar)'}
              </>
            )}
          </p>
          <label className="form-field">
            <span>Nombre visible</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={me.displayName}
              maxLength={24}
              autoComplete="nickname"
            />
          </label>
          <div className="callout-actions">
            <button
              className="button button-secondary"
              disabled={busy || name.trim().length < 2}
              onClick={() =>
                void run(async () => {
                  await updateName(name.trim());
                  setName('');
                  push('Nombre actualizado.');
                })
              }
            >
              Guardar nombre
            </button>
            {isGuest ? null : (
              <button
                className="button button-light"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await logout();
                    onClose();
                  })
                }
              >
                Cerrar sesión
              </button>
            )}
          </div>
          {isGuest && (
            <>
              <h3>Guardá tu historial en una cuenta</h3>
              <div className="callout-actions">
                <button
                  className="button button-primary"
                  onClick={() => {
                    setView('register');
                    setError(null);
                  }}
                >
                  Crear cuenta
                </button>
                <button
                  className="button button-light"
                  onClick={() => {
                    setView('login');
                    setError(null);
                  }}
                >
                  Ya tengo cuenta
                </button>
              </div>
            </>
          )}
        </>
      )}

      {view === 'login' && (
        <>
          <h3>Iniciar sesión</h3>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="form-field">
            <span>Clave</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="callout-actions">
            <button
              className="text-button"
              onClick={() => {
                setView('forgot');
                setError(null);
              }}
            >
              Olvidé mi clave
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await login(email.trim(), password);
                  onClose();
                })
              }
            >
              Entrá
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setView('register');
              setError(null);
            }}
          >
            ← Crear cuenta nueva
          </button>
        </>
      )}

      {view === 'register' && (
        <>
          <h3>Crear cuenta</h3>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="form-field">
            <span>Clave (mínimo 10 caracteres)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="form-field">
            <span>Código de invitación</span>
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value.toUpperCase())}
              autoComplete="off"
              placeholder="Ej: ABC123"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="callout-actions">
            <button
              className="text-button"
              onClick={() => {
                setView('main');
                setError(null);
              }}
            >
              ← Volver
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await register({
                    email: email.trim(),
                    password,
                    displayName: me.displayName,
                    inviteCode: invite.trim() || undefined,
                  });
                  push(
                    result.upgraded
                      ? '¡Cuenta creada! Se conservó tu historial.'
                      : '¡Cuenta creada! Revisá tu email para verificarla.',
                  );
                  onClose();
                })
              }
            >
              Crear cuenta
            </button>
          </div>
        </>
      )}

      {view === 'forgot' && (
        <>
          <h3>Recuperar acceso</h3>
          {sent ? (
            <p>
              Si ese email tiene cuenta, te enviamos un enlace para elegir una
              nueva clave.
            </p>
          ) : (
            <>
              <label className="form-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="callout-actions">
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await forgot(email.trim());
                      setSent(true);
                    })
                  }
                >
                  Enviar enlace
                </button>
              </div>
            </>
          )}
          <button
            className="text-button"
            onClick={() => {
              setView('login');
              setError(null);
            }}
          >
            ← Volver a iniciar sesión
          </button>
        </>
      )}
    </div>
  );
}
