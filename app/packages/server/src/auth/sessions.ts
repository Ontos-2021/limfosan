import { randomBytes } from 'node:crypto';
import { parse, serialize } from 'cookie';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { sessions, users, type DbHandle } from '../db/index.js';
import type { Session, User } from '../db/schema.js';

export const SESSION_COOKIE = 'mesa_sid';

export interface AuthContext {
  user: User;
  session: Session;
}

export interface AuthedRequest extends Request {
  auth: AuthContext;
}

/** Lee el contexto que dejó requireAuth (lanza si falta: error de ruta). */
export function getAuth(req: Request): AuthContext {
  const auth = (req as Partial<AuthedRequest>).auth;
  if (!auth) throw new Error('sin contexto de autenticación');
  return auth;
}

export function readSessionId(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const sid = parse(header)[SESSION_COOKIE];
  return typeof sid === 'string' && sid.length > 0 ? sid : null;
}

export function sessionCookie(
  config: AppConfig,
  sid: string | null,
  maxAgeSeconds?: number,
): string {
  return serialize(SESSION_COOKIE, sid ?? '', {
    httpOnly: true,
    secure: !config.allowInsecureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: sid === null ? 0 : (maxAgeSeconds ?? config.sessionTtlDays * 86400),
  });
}

export async function createSession(
  db: DbHandle['db'],
  userId: string,
  ttlDays: number,
  ip: string | null,
): Promise<{ session: Session; csrfToken: string }> {
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  const [session] = await db
    .insert(sessions)
    .values({ userId, csrfToken, expiresAt, ip })
    .returning();
  return { session, csrfToken };
}

/** Sesión válida + usuario no baneado; actualiza lastSeen (con throttle). */
export async function loadAuth(
  db: DbHandle['db'],
  sid: string,
): Promise<AuthContext | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sid))
    .limit(1);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.bannedAt !== null) return null;
  const lastSeen = session.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, session.id));
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id));
  }
  return { user, session };
}

export async function destroySession(
  db: DbHandle['db'],
  sid: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sid));
}

export function requireAuth(db: DbHandle['db']) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const sid = readSessionId(req);
    if (!sid) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const auth = await loadAuth(db, sid);
    if (!auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    (req as AuthedRequest).auth = auth;
    next();
  };
}

/** Solo cuentas admin con MFA verificada en esta sesión (step-up). */
export function requireAdminMfa() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as Partial<AuthedRequest>).auth;
    if (!auth || auth.user.role !== 'admin') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (!auth.session.mfaVerified) {
      res.status(403).json({ error: 'mfa_required' });
      return;
    }
    next();
  };
}
