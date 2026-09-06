import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { closeDb, createDb, migrateDb, type DbHandle } from './db/index.js';
import { ensureDatabase } from './db/ensure.js';
import {
  LogEmailSender,
  ResendEmailSender,
  type EmailSender,
} from './email.js';
import { MatchManager } from './game/manager.js';
import { attachRooms } from './game/rooms.js';
import { startJobSweeper } from './jobs.js';

export interface BootedApp {
  config: AppConfig;
  handle: DbHandle;
  sender: EmailSender;
  manager: MatchManager;
  shutdown: () => Promise<void>;
}

/** Arranca DB (con migraciones), colas y manager. El HTTP lo arma index. */
export async function bootDeps(
  config: AppConfig,
): Promise<Omit<BootedApp, 'shutdown'> & { stopJobs: () => void }> {
  if (process.env['DB_AUTOCREATE'] === '1') {
    await ensureDatabase(config.databaseUrl);
  }
  const handle = createDb(config.databaseUrl);
  await migrateDb(handle.db);
  const sender: EmailSender =
    config.emailProvider === 'resend'
      ? new ResendEmailSender(config.resendApiKey, config.emailFrom)
      : new LogEmailSender();
  const manager = new MatchManager(config, handle.db);
  const stopJobs = startJobSweeper(config, handle.db, sender);
  return { config, handle, sender, manager, stopJobs };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { handle, sender, manager, stopJobs } = await bootDeps(config);
  const app = createApp(config, { db: handle, sender, manager });
  const server = createServer(app);
  const rooms = attachRooms(server, config, handle.db, manager);

  server.listen(config.port, () => {
    console.log(
      JSON.stringify({
        msg: 'backend escuchando',
        port: config.port,
        env: config.env,
        version: config.version,
        commit: config.commit,
      }),
    );
  });

  // Cierre ordenado: deja de aceptar, avisa a los sockets, persiste
  // (cada jugada ya está en Postgres) y cierra el pool.
  let closing = false;
  async function shutdown(signal: string): Promise<void> {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ msg: 'cierre ordenado', signal }));
    stopJobs();
    manager.shutdown();
    try {
      rooms.io.emit('mesa:error', {
        code: 'reinicio',
        message: 'El servidor se está actualizando. Reconectando…',
      });
      await rooms.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeDb(handle);
      process.exit(0);
    } catch (err) {
      console.error(
        JSON.stringify({ msg: 'error en cierre', err: String(err) }),
      );
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(JSON.stringify({ msg: 'fallo el arranque', err: String(err) }));
  process.exit(1);
});
