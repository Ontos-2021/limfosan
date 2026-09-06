import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);
const server = createServer(app);

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

// Cierre ordenado (base para el reinicio controlado con persistencia de E4).
function shutdown(signal: string): void {
  console.log(JSON.stringify({ msg: 'cierre ordenado', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
