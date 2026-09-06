import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ForgotPasswordSchema,
  GuestEnsureSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  UpdateMeSchema,
  VerifyEmailSchema,
} from '@limfosan/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import {
  createSession,
  destroySession,
  getAuth,
  readSessionId,
  requireAuth,
  sessionCookie,
} from '../auth/sessions.js';
import { requireCsrf } from '../auth/csrf.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  emailTokens,
  invites,
  sessions,
  users,
  type User,
} from '../db/index.js';
import { resetEmail, verificationEmail, type EmailMessage } from '../email.js';
import { enqueueEmail } from '../jobs.js';
import { bumpMetric } from '../metrics.js';
import { clientIp, testableRateLimit } from '../ratelimit.js';
import { parseBody, type RouteContext } from './context.js';

function publicUser(user: User) {
  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    totpEnabled: user.totpEnabled,
  };
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function guestName(): string {
  return `Invitado·${1000 + Math.floor(Math.random() * 9000)}`;
}

export function authRoutes(ctx: RouteContext): Router {
  const { config, db, sender } = ctx;
  const router = Router();
  const auth = requireAuth(db);
  const csrf = requireCsrf();

  const limitGuest = testableRateLimit(process.env, {
    windowMs: 60_000,
    max: 30,
    key: (req) => `guest:${clientIp(req)}`,
  });
  const limitAuth = testableRateLimit(process.env, {
    windowMs: 5 * 60_000,
    max: 20,
    key: (req) => `auth:${clientIp(req)}`,
  });
  const limitSensitive = testableRateLimit(process.env, {
    windowMs: 60_000,
    max: 5,
    key: (req) => {
      const body = req.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email : '';
      return `sensitive:${clientIp(req)}:${email.slice(0, 64)}`;
    },
  });

  /** Crea sesión de invitado (el embudo principal: jugar sin registrarse). */
  router.post('/session/guest', limitGuest, async (req, res) => {
    const parsed = parseBody(GuestEnsureSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const [user] = await db
      .insert(users)
      .values({
        role: 'guest',
        displayName: parsed.data.displayName ?? guestName(),
      })
      .returning();
    const { session, csrfToken } = await createSession(
      db,
      user.id,
      config.sessionTtlDays,
      clientIp(req),
    );
    res.setHeader('Set-Cookie', sessionCookie(config, session.id));
    res.json({ user: publicUser(user), csrfToken });
  });

  /** Token CSRF vigente (para refrescar tras recargar la página). */
  router.get('/csrf', auth, (req, res) => {
    res.json({ csrfToken: getAuth(req).session.csrfToken });
  });

  router.post('/auth/register', limitAuth, async (req, res) => {
    const parsed = parseBody(RegisterSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const { email, password, displayName } = parsed.data;
    const inviteCode = parsed.data.inviteCode;

    if (config.requireInvite && !inviteCode) {
      res.status(400).json({ error: 'invite_required' });
      return;
    }

    // Puerta admin: código de bootstrap de un solo uso + email del admin.
    let makeAdmin = false;
    if (
      inviteCode &&
      config.adminBootstrapCode.length > 0 &&
      config.adminEmail.length > 0 &&
      safeEqual(inviteCode, config.adminBootstrapCode) &&
      email === config.adminEmail
    ) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);
      if (existing.length > 0) {
        res.status(400).json({ error: 'invite_invalid' });
        return;
      }
      makeAdmin = true;
    } else if (inviteCode) {
      const [invite] = await db
        .select()
        .from(invites)
        .where(eq(invites.code, inviteCode))
        .limit(1);
      const valid =
        invite &&
        !invite.revoked &&
        invite.uses < invite.maxUses &&
        (invite.expiresAt === null || invite.expiresAt.getTime() > Date.now());
      if (!valid || !invite) {
        res.status(400).json({ error: 'invite_invalid' });
        return;
      }
      await db
        .update(invites)
        .set({ uses: invite.uses + 1 })
        .where(eq(invites.id, invite.id));
    }

    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (taken) {
      res.status(409).json({ error: 'email_en_uso' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const sid = readSessionId(req);
    let userId: string;
    let upgraded = false;
    // Si la sesión actual es de invitado, la promovemos (conserva historial).
    const current = sid ? await lookupSessionUser(db, sid) : null;
    if (current && current.user.role === 'guest') {
      userId = current.user.id;
      upgraded = true;
      await db
        .update(users)
        .set({
          role: makeAdmin ? 'admin' : 'user',
          email,
          passwordHash,
          displayName,
        })
        .where(eq(users.id, userId));
      await destroySession(db, sid as string);
      await bumpMetric(db, 'guest_upgrades');
    } else {
      const [created] = await db
        .insert(users)
        .values({
          role: makeAdmin ? 'admin' : 'user',
          email,
          passwordHash,
          displayName,
        })
        .returning();
      userId = created.id;
    }
    await bumpMetric(db, 'signups');

    const token = randomToken();
    await db.insert(emailTokens).values({
      userId,
      purpose: 'verify',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
    const mail = verificationEmail(config.appUrl, token);
    const message: EmailMessage = { to: email, ...mail };
    try {
      await sender.send(message);
    } catch {
      await enqueueEmail(db, message);
    }

    const { session: fresh, csrfToken } = await createSession(
      db,
      userId,
      config.sessionTtlDays,
      clientIp(req),
    );
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    res.setHeader('Set-Cookie', sessionCookie(config, fresh.id));
    res.status(201).json({ user: publicUser(user), csrfToken, upgraded });
  });

  router.post('/auth/verify', limitSensitive, async (req, res) => {
    const parsed = parseBody(VerifyEmailSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const [row] = await db
      .select()
      .from(emailTokens)
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken(parsed.data.token)),
          eq(emailTokens.purpose, 'verify'),
          isNull(emailTokens.usedAt),
        ),
      )
      .limit(1);
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: 'token_invalido' });
      return;
    }
    await db
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailTokens.id, row.id));
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, row.userId));
    res.json({ ok: true });
  });

  router.post('/auth/login', limitSensitive, async (req, res) => {
    const parsed = parseBody(LoginSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    const ok =
      user?.passwordHash != null &&
      user.bannedAt === null &&
      (await verifyPassword(user.passwordHash, parsed.data.password));
    if (!user || !ok) {
      res.status(401).json({ error: 'credenciales_invalidas' });
      return;
    }
    const { session, csrfToken } = await createSession(
      db,
      user.id,
      config.sessionTtlDays,
      clientIp(req),
    );
    res.setHeader('Set-Cookie', sessionCookie(config, session.id));
    res.json({ user: publicUser(user), csrfToken });
  });

  router.post('/auth/logout', auth, csrf, async (req, res) => {
    const sid = readSessionId(req);
    if (sid) await destroySession(db, sid);
    res.setHeader('Set-Cookie', sessionCookie(config, null));
    res.json({ ok: true });
  });

  router.get('/auth/me', auth, (req, res) => {
    const authz = getAuth(req);
    res.json({
      user: publicUser(authz.user),
      csrfToken: authz.session.csrfToken,
    });
  });

  router.patch('/auth/me', auth, csrf, async (req, res) => {
    const parsed = parseBody(UpdateMeSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    const [user] = await db
      .update(users)
      .set({ displayName: parsed.data.displayName })
      .where(eq(users.id, authz.user.id))
      .returning();
    res.json({ user: publicUser(user) });
  });

  router.post('/auth/password/forgot', limitSensitive, async (req, res) => {
    const parsed = parseBody(ForgotPasswordSchema, req.body ?? {});
    // Respuesta genérica siempre: no revela si el email existe.
    if (parsed.ok) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1);
      if (user && user.passwordHash !== null && user.bannedAt === null) {
        const token = randomToken();
        await db.insert(emailTokens).values({
          userId: user.id,
          purpose: 'reset',
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 3600_000),
        });
        const mail = resetEmail(config.appUrl, token);
        const message: EmailMessage = { to: parsed.data.email, ...mail };
        try {
          await sender.send(message);
        } catch {
          await enqueueEmail(db, message);
        }
      }
    }
    res.json({ ok: true });
  });

  router.post('/auth/password/reset', limitSensitive, async (req, res) => {
    const parsed = parseBody(ResetPasswordSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const [row] = await db
      .select()
      .from(emailTokens)
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken(parsed.data.token)),
          eq(emailTokens.purpose, 'reset'),
          isNull(emailTokens.usedAt),
        ),
      )
      .limit(1);
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ error: 'token_invalido' });
      return;
    }
    await db
      .update(emailTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailTokens.id, row.id));
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.password) })
      .where(eq(users.id, row.userId));
    // Fuerza re-login en todos los dispositivos.
    await db.delete(sessions).where(eq(sessions.userId, row.userId));
    res.json({ ok: true });
  });

  return router;
}

// Lookup liviano de sesión para el flujo de promoción guest→cuenta.
async function lookupSessionUser(
  db: RouteContext['db'],
  sid: string,
): Promise<{ user: User } | null> {
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
  return { user };
}
