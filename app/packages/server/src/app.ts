import express, { type Express } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from './config.js';
import { pingDb, type DbHandle } from './db/index.js';
import type { EmailSender } from './email.js';
import type { MatchManager } from './game/manager.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { reportsRoutes } from './routes/reports.js';
import { tablesRoutes } from './routes/tables.js';

export interface AppDeps {
  db: DbHandle;
  sender: EmailSender;
  manager: MatchManager;
}

/**
 * Crea la app Express. En producción sirve además el frontend compilado
 * (mismo dominio para API + web + sockets).
 */
export function createApp(config: AppConfig, deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  // Detrás de Traefik/Coolify: IP real del cliente para rate limit y auditoría.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // La PWA no necesita cross-origin isolation por ahora.
      crossOriginEmbedderPolicy: false,
    }),
  );
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

  // Readiness: la base tiene que responder para recibir tráfico.
  app.get('/api/ready', async (_req, res) => {
    const dbOk = await pingDb(deps.db);
    if (!dbOk) {
      res.status(503).json({ status: 'degraded', checks: { db: false } });
      return;
    }
    res.json({ status: 'ok', checks: { db: true } });
  });

  app.use('/api', authRoutes({ config, db: deps.db.db, sender: deps.sender }));
  app.use(
    '/api',
    tablesRoutes({
      config,
      db: deps.db.db,
      sender: deps.sender,
      manager: deps.manager,
    }),
  );
  app.use(
    '/api',
    reportsRoutes({ config, db: deps.db.db, sender: deps.sender }),
  );
  app.use('/api', adminRoutes({ config, db: deps.db.db, sender: deps.sender }));

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
