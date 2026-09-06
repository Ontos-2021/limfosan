import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root en index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

export function useBackendHealth(): string {
  const [estado, setEstado] = useState('conectando…');
  useEffect(() => {
    let cancelado = false;
    fetch('/api/health')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((j: unknown) => {
        if (cancelado) return;
        const h = j as { app?: unknown; version?: unknown; commit?: unknown };
        setEstado(
          h.app === 'truco'
            ? `backend OK — v${String(h.version)} (${String(h.commit)})`
            : 'backend respondió pero NO es truco',
        );
      })
      .catch(() => {
        if (!cancelado) setEstado('backend no disponible');
      });
    return () => {
      cancelado = true;
    };
  }, []);
  return estado;
}
