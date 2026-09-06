/** Configuración del backend desde variables de entorno (secretos solo por env). */
export interface AppConfig {
  port: number;
  env: string;
  version: string;
  commit: string;
  /** URL pública de la app (enlaces de email, verificación de origen). */
  appUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  /** Días de vida de la cookie de sesión. Default 30. */
  sessionTtlDays: number;
  /** Registro de cuentas: requiere código de invitación (modo beta). Default true. */
  requireInvite: boolean;
  /** Email del administrador inicial (se marca admin al registrarse). */
  adminEmail: string;
  /** Código de bootstrap de un solo uso para crear al admin (sin invitación previa). */
  adminBootstrapCode: string;
  emailProvider: 'log' | 'resend';
  emailFrom: string;
  resendApiKey: string;
  /** Segundos por jugada de carta antes de jugada automática. Default 60. */
  turnPlaySeconds: number;
  /** Segundos para responder un canto antes de "no quiero" automático. Default 30. */
  turnRespondSeconds: number;
  /** Gracia de desconexión antes de declarar abandono. Default 45. */
  graceSeconds: number;
  /** Reconexiones permitidas por asiento y partida. Default 5. */
  maxReconnects: number;
  /** SOLO desarrollo/pruebas locales sin HTTPS: permite cookie sin Secure. */
  allowInsecureCookies: boolean;
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválido: ${value ?? '(no definido)'}`);
  }
  return port;
}

function parseIntEnv(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} inválido: ${value}`);
  }
  return parsed;
}

function parseNonNegativeEnv(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} inválido: ${value}`);
  }
  return parsed;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  const isProd = nodeEnv === 'production';
  const sessionSecret = env['SESSION_SECRET'] ?? '';
  if (sessionSecret.length < 32) {
    if (isProd) {
      throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
    }
  }
  const databaseUrl =
    env['DATABASE_URL'] ?? 'postgres://truco:truco@127.0.0.1:5433/truco';
  return {
    port: parsePort(env['PORT']),
    env: nodeEnv,
    version: env['APP_VERSION'] ?? '0.1.0-dev',
    commit: env['COMMIT_SHA'] ?? 'unknown',
    appUrl: env['APP_URL'] ?? 'http://localhost:3000',
    databaseUrl,
    sessionSecret:
      sessionSecret || 'dev-inseguro-solo-para-desarrollo-local-32b',
    sessionTtlDays: parseIntEnv(
      env['SESSION_TTL_DAYS'],
      30,
      'SESSION_TTL_DAYS',
    ),
    requireInvite: parseBool(env['REQUIRE_INVITE'], true),
    adminEmail: (env['ADMIN_EMAIL'] ?? '').trim().toLowerCase(),
    adminBootstrapCode: (env['ADMIN_BOOTSTRAP_CODE'] ?? '').trim(),
    emailProvider: env['RESEND_API_KEY'] ? 'resend' : 'log',
    emailFrom: env['EMAIL_FROM'] ?? 'Mesa <hola@ejemplo.local>',
    resendApiKey: env['RESEND_API_KEY'] ?? '',
    turnPlaySeconds: parseIntEnv(
      env['TURN_PLAY_SECONDS'],
      60,
      'TURN_PLAY_SECONDS',
    ),
    turnRespondSeconds: parseIntEnv(
      env['TURN_RESPOND_SECONDS'],
      30,
      'TURN_RESPOND_SECONDS',
    ),
    graceSeconds: parseIntEnv(env['GRACE_SECONDS'], 45, 'GRACE_SECONDS'),
    maxReconnects: parseNonNegativeEnv(
      env['MAX_RECONNECTS'],
      5,
      'MAX_RECONNECTS',
    ),
    allowInsecureCookies: parseBool(env['ALLOW_INSECURE_COOKIES'], !isProd),
  };
}
