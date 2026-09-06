import { useBackendHealth } from './main';

/**
 * Placeholder de la mesa (E5). En E1 solo verifica que el cliente
 * habla con el backend correcto a través del mismo dominio.
 */
export default function App() {
  const backend = useBackendHealth();
  return (
    <main className="mesa">
      <h1>Truco — Mesa</h1>
      <p>La mesa de juego llega en E5. Estado del backend: {backend}</p>
    </main>
  );
}
