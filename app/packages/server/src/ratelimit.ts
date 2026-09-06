import type { NextFunction, Request, Response } from 'express';

/**
 * Rate limit en memoria (token bucket). Suficiente para una sola instancia
 * (despliegue inicial); documentado en el runbook para escalar.
 */
interface Bucket {
  tokens: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();

// Limpieza periódica para no acumular claves (un solo timer global).
let sweeperStarted = false;

function startSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  timer.unref();
}

/** Solo para pruebas: vacía todos los buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function rateLimit(options: RateLimitOptions) {
  startSweeper();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.key(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { tokens: options.max, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.tokens <= 0) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    bucket.tokens -= 1;
    next();
  };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Desactiva el rate limit en pruebas salvo que se pida explícito. */
export function testableRateLimit(
  env: NodeJS.ProcessEnv,
  options: RateLimitOptions,
) {
  if (env['NODE_ENV'] === 'test' && env['RATE_LIMIT_TEST'] !== '1') {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }
  return rateLimit(options);
}
