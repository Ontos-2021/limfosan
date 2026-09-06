/** Configuración del backend desde variables de entorno (secretos solo por env). */
export interface AppConfig {
  port: number;
  env: string;
  version: string;
  commit: string;
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválido: ${value ?? '(no definido)'}`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parsePort(env['PORT']),
    env: env['NODE_ENV'] ?? 'development',
    version: env['APP_VERSION'] ?? '0.1.0-dev',
    commit: env['COMMIT_SHA'] ?? 'unknown',
  };
}
