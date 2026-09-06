import { createServer, type Server as HttpServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import {
  closeDb,
  createDb,
  migrateDb,
  type DbHandle,
} from '../src/db/index.js';
import { LogEmailSender } from '../src/email.js';
import { MatchManager } from '../src/game/manager.js';
import { attachRooms } from '../src/game/rooms.js';

export function testDatabaseUrl(): string {
  return (
    process.env['TEST_DATABASE_URL'] ??
    'postgres://truco:truco@127.0.0.1:5433/truco_test'
  );
}

export interface TestStack {
  config: AppConfig;
  handle: DbHandle;
  sender: LogEmailSender;
  manager: MatchManager;
  app: ReturnType<typeof createApp>;
  http: HttpServer;
  url: string;
  close: () => Promise<void>;
}

async function truncateAll(handle: DbHandle): Promise<void> {
  await handle.db.execute(sql`
    TRUNCATE users, sessions, invites, email_tokens, tables, table_seats,
      games, game_events, reports, feature_flags, jobs, metrics_daily, audit_admin
    RESTART IDENTITY CASCADE
  `);
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    SESSION_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres-ok',
    APP_URL: 'http://127.0.0.1:3000',
    ADMIN_EMAIL: 'admin@test.local',
    ADMIN_BOOTSTRAP_CODE: 'ADMIN-UNICO-1',
    REQUIRE_INVITE: 'true',
    ALLOW_INSECURE_COOKIES: '1',
    ...overrides,
  });
}

/**
 * Stack completo por test: app Express + Socket.IO + Postgres de pruebas.
 * Tablas truncadas antes de cada test (los archivos corren en serie).
 */
export async function createTestStack(
  overrides: Record<string, string> = {},
): Promise<TestStack> {
  const config = testConfig(overrides);
  const handle = createDb(config.databaseUrl);
  await migrateDb(handle.db);
  await truncateAll(handle);
  const sender = new LogEmailSender();
  const manager = new MatchManager(config, handle.db);
  const app = createApp(config, { db: handle, sender, manager });
  const http = createServer(app);
  const rooms = attachRooms(http, config, handle.db, manager);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    config,
    handle,
    sender,
    manager,
    app,
    http,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      manager.shutdown();
      // Deja que los 'disconnect' pendientes se procesen con el pool abierto.
      await new Promise((r) => setTimeout(r, 300));
      await rooms.close();
      await new Promise<void>((resolve) => {
        // io.close() puede haber cerrado ya el servidor HTTP.
        if (!http.listening) {
          resolve();
          return;
        }
        http.close(() => resolve());
      });
      await closeDb(handle);
    },
  };
}

/** Limpia la BD entre tests de un mismo archivo/stack. */
export function truncateBetweenTests(getHandle: () => DbHandle): void {
  beforeEach(async () => {
    await truncateAll(getHandle());
  });
}

export { request, ioClient, afterEach };
export type { ClientSocket };
