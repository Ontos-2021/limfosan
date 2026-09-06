import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo el backend corre en :3000; en producción lo sirve él mismo.
      '/api': 'http://localhost:3000',
    },
  },
});
