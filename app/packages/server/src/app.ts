import express, { type Express } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from './config.js';

/**
 * Crea la app Express. En producción sirve además el frontend compilado
 * (mismo dominio para API + web + sockets).
 */
export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));

  // Healthcheck con identidad: valida app + versión, no solo un 200.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'truco',
      version: config.version,
      env: config.env,
      commit: config.commit,
      node: process.version,
    });
  });

  // Readiness: en E4 sumará chequeos reales (DB, etc.).
  app.get('/api/ready', (_req, res) => {
    res.json({ status: 'ok', checks: {} });
  });

  // Frontend compilado por Vite (existe solo en la imagen Docker / tras build web).
  const webDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../web/dist',
  );
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  // 404 JSON para rutas de API desconocidas.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
