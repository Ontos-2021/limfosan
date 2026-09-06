import { useState } from 'react';
import { api, ApiError } from './api';
import { useSession } from './session';
import { useToasts } from './toasts';

/** Entrada al juego online: crear mesa o unirse con código. */
export default function Lobby({
  onJoin,
  onExit,
}: {
  onJoin: (code: string) => void;
  onExit: () => void;
}) {
  const { status, refresh } = useSession();
  const { push } = useToasts();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const data = await api.post<{ code: string }>('/api/mesas', {});
      onJoin(data.code);
    } catch (err) {
      push(
        err instanceof ApiError && err.code === 'mesas_pausadas'
          ? 'Las mesas nuevas están pausadas. Probá más tarde.'
          : 'No se pudo crear la mesa. Reintentá.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  function joinWithCode() {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      push('El código tiene 6 letras o números.', 'error');
      return;
    }
    onJoin(normalized);
  }

  return (
    <>
      <a className="skip-link" href="#lobby">
        Ir al acceso online
      </a>
      <main className="game-layout">
        <section className="game-column" aria-label="Jugar online" id="lobby">
          <div className="table-heading">
            <div>
              <span className="eyebrow">JUGÁ CON UNA PERSONA</span>
              <h1>En línea.</h1>
            </div>
          </div>
          {status === 'offline' ? (
            <div className="lobby-card" role="alert">
              <h2>Sin conexión</h2>
              <p>
                El modo online necesita al servidor. Revisá tu conexión y probá
                de nuevo; mientras tanto podés jugar contra la CPU.
              </p>
              <div className="callout-actions">
                <button className="button button-light" onClick={onExit}>
                  Volver a vs CPU
                </button>
                <button
                  className="button button-primary"
                  onClick={() => void refresh()}
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="lobby-card">
                <span className="eyebrow">CREAR MESA PRIVADA</span>
                <h2>Invitá a un amigo</h2>
                <p>
                  Creás la mesa y compartís el enlace por WhatsApp. Quien lo
                  abra se sienta a jugar: sin instalar nada.
                </p>
                <button
                  className="button button-primary"
                  disabled={busy || status !== 'ready'}
                  onClick={() => void create()}
                >
                  Crear mesa
                </button>
              </div>
              <div className="lobby-card">
                <span className="eyebrow">UNIRSE CON CÓDIGO</span>
                <h2>Te invitaron</h2>
                <p>Escribí el código de 6 letras que te pasaron.</p>
                <div className="join-row">
                  <label className="form-field join-field">
                    <span>Código de mesa</span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="ABC123"
                      maxLength={6}
                      autoComplete="off"
                      inputMode="text"
                    />
                  </label>
                  <button
                    className="button button-secondary"
                    disabled={status !== 'ready'}
                    onClick={joinWithCode}
                  >
                    Unirse
                  </button>
                </div>
              </div>
              <button className="text-button" onClick={onExit}>
                ← Volver a jugar contra la CPU
              </button>
            </>
          )}
        </section>

        <aside className="side-panel" aria-label="Acerca del juego online">
          <div className="intro-note">
            <span className="eyebrow">CÓMO FUNCIONA</span>
            <h2>
              El de siempre,
              <br />a la distancia.
            </h2>
            <p>
              Las mismas reglas, con las cartas de cada uno en privado. Si se
              corta la conexión, tu lugar se guarda unos segundos.
            </p>
          </div>
          <section className="demo-note">
            <span className="demo-label">JUEGO EN LÍNEA</span>
            <p>
              Si algo falla, recargá: la partida se recupera desde el servidor.
            </p>
          </section>
        </aside>
      </main>
    </>
  );
}
