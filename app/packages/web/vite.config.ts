import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Backend a proxear: por defecto :3000; los tests E2E usan otro puerto
// (E2E_BACKEND) porque el 3000 puede estar ocupado en la máquina.
const backend = process.env['E2E_BACKEND'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo el backend corre en :3000; en producción lo sirve él mismo.
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
