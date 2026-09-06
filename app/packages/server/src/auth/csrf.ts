import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from './sessions.js';

/**
 * CSRF con token sincronizado: el token vive en la fila de sesión y el
 * cliente lo envía en el header `x-csrf-token` en cada mutación.
 * Compara hashes SHA-256 para evitar fugas por longitud en timingSafeEqual.
 */
export function csrfValid(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(provided).digest();
  return timingSafeEqual(a, b);
}

export function requireCsrf() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Partial<AuthedRequest>).auth;
    if (!auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!csrfValid(auth.session.csrfToken, req.headers['x-csrf-token'])) {
      res.status(403).json({ error: 'csrf_invalid' });
      return;
    }
    next();
  };
}
