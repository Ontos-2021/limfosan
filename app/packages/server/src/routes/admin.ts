import { randomInt } from 'node:crypto';
import {
  AdminLoginSchema,
  AdminMfaVerifySchema,
  FlagSetSchema,
  InviteCreateSchema,
} from '@limfosan/shared';
import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireCsrf } from '../auth/csrf.js';
import { getAuth, requireAdminMfa, requireAuth } from '../auth/sessions.js';
import { verifyPassword } from '../auth/password.js';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '../auth/totp.js';
import { auditAdmin, invites, reports, sessions, users } from '../db/index.js';
import { FLAG_KEYS, listFlags, setFlag, type FlagKey } from '../flags.js';
import { getMetrics } from '../metrics.js';
import { clientIp, testableRateLimit } from '../ratelimit.js';
import { parseBody, type RouteContext } from './context.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

async function audit(
  ctx: RouteContext,
  adminId: string | null,
  action: string,
  detail: unknown,
): Promise<void> {
  await ctx.db.insert(auditAdmin).values({
    adminId,
    action,
    detail: (detail ?? null) as Record<string, unknown> | null,
  });
}

/**
 * Panel admin por API (sin UI en E2; ver runbook para uso con curl).
 * Todo requiere rol admin + MFA verificada en la sesión, salvo el propio
 * login/enroll de MFA.
 */
export function adminRoutes(ctx: RouteContext): Router {
  const { db } = ctx;
  const router = Router();
  const auth = requireAuth(db);
  const csrf = requireCsrf();
  const adminMfa = requireAdminMfa();

  const limitAdmin = testableRateLimit(process.env, {
    windowMs: 60_000,
    max: 30,
    key: (req) => `admin:${clientIp(req)}`,
  });

  /** Paso 2 del login admin: contraseña + TOTP → marca la sesión mfaVerified. */
  router.post('/admin/login', auth, csrf, limitAdmin, async (req, res) => {
    const parsed = parseBody(AdminLoginSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    if (authz.user.role !== 'admin' || authz.user.email !== parsed.data.email) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authz.user.id))
      .limit(1);
    if (
      !user?.passwordHash ||
      !(await verifyPassword(user.passwordHash, parsed.data.password))
    ) {
      res.status(401).json({ error: 'credenciales_invalidas' });
      return;
    }
    if (!user.totpEnabled || !user.totpSecret) {
      res.status(400).json({ error: 'mfa_no_configurado' });
      return;
    }
    if (!verifyTotp(user.totpSecret, parsed.data.totp)) {
      res.status(401).json({ error: 'totp_invalido' });
      return;
    }
    await db
      .update(sessions)
      .set({ mfaVerified: true })
      .where(eq(sessions.id, authz.session.id));
    await audit(ctx, user.id, 'admin.login', {});
    res.json({ ok: true });
  });

  /** Genera (o rota) el secreto TOTP del admin. Requiere sesión admin. */
  router.post('/admin/mfa/enroll', auth, csrf, limitAdmin, async (req, res) => {
    const authz = getAuth(req);
    if (authz.user.role !== 'admin' || !authz.user.email) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const secret = generateTotpSecret();
    await db
      .update(users)
      .set({ totpSecret: secret, totpEnabled: false })
      .where(eq(users.id, authz.user.id));
    await db
      .update(sessions)
      .set({ mfaVerified: false })
      .where(eq(sessions.id, authz.session.id));
    res.json({
      secret,
      otpauthUrl: totpAuthUrl(secret, authz.user.email),
    });
  });

  /** Activa el TOTP verificando un código; deja la sesión con MFA OK. */
  router.post('/admin/mfa/verify', auth, csrf, limitAdmin, async (req, res) => {
    const parsed = parseBody(AdminMfaVerifySchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    if (authz.user.role !== 'admin') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authz.user.id))
      .limit(1);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, parsed.data.totp)) {
      res.status(401).json({ error: 'totp_invalido' });
      return;
    }
    await db
      .update(users)
      .set({ totpEnabled: true })
      .where(eq(users.id, user.id));
    await db
      .update(sessions)
      .set({ mfaVerified: true })
      .where(eq(sessions.id, authz.session.id));
    await audit(ctx, user.id, 'admin.mfa_enabled', {});
    res.json({ ok: true });
  });

  router.get('/admin/invites', auth, adminMfa, async (_req, res) => {
    const rows = await db
      .select()
      .from(invites)
      .orderBy(desc(invites.createdAt))
      .limit(200);
    res.json({
      invites: rows.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.label,
        maxUses: r.maxUses,
        uses: r.uses,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        revoked: r.revoked,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  router.post('/admin/invites', auth, csrf, adminMfa, async (req, res) => {
    const parsed = parseBody(InviteCreateSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    const [row] = await db
      .insert(invites)
      .values({
        code: randomInviteCode(),
        label: parsed.data.label ?? null,
        maxUses: parsed.data.maxUses,
        expiresAt: parsed.data.expiresInDays
          ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
          : null,
        createdBy: authz.user.id,
      })
      .returning({ id: invites.id, code: invites.code });
    await audit(ctx, authz.user.id, 'invite.create', { code: row.code });
    res.status(201).json({ id: row.id, code: row.code });
  });

  router.post(
    '/admin/invites/:id/revocar',
    auth,
    csrf,
    adminMfa,
    async (req, res) => {
      const authz = getAuth(req);
      await db
        .update(invites)
        .set({ revoked: true })
        .where(eq(invites.id, String(req.params['id'])));
      await audit(ctx, authz.user.id, 'invite.revoke', {
        id: String(req.params['id']),
      });
      res.json({ ok: true });
    },
  );

  router.get('/admin/flags', auth, adminMfa, async (_req, res) => {
    res.json({ flags: await listFlags(db) });
  });

  router.post('/admin/flags/:key', auth, csrf, adminMfa, async (req, res) => {
    const key = String(req.params['key']);
    if (!(FLAG_KEYS as readonly string[]).includes(key)) {
      res.status(404).json({ error: 'flag_desconocido' });
      return;
    }
    const parsed = parseBody(FlagSetSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    await setFlag(db, key as FlagKey, parsed.data.enabled, authz.user.id);
    await audit(ctx, authz.user.id, 'flag.set', {
      key,
      enabled: parsed.data.enabled,
    });
    res.json({ ok: true });
  });

  router.get('/admin/metricas', auth, adminMfa, async (req, res) => {
    const days = Math.min(
      90,
      Math.max(1, Number.parseInt(String(req.query['days'] ?? '7'), 10) || 7),
    );
    res.json({ days, metrics: await getMetrics(db, days) });
  });

  router.get('/admin/reportes', auth, adminMfa, async (_req, res) => {
    const rows = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt))
      .limit(200);
    res.json({
      reports: rows.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reportedUserId: r.reportedUserId,
        tableId: r.tableId,
        reason: r.reason,
        handled: r.handled,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  router.post(
    '/admin/reportes/:id/atender',
    auth,
    csrf,
    adminMfa,
    async (req, res) => {
      const authz = getAuth(req);
      await db
        .update(reports)
        .set({ handled: true })
        .where(eq(reports.id, String(req.params['id'])));
      await audit(ctx, authz.user.id, 'report.handle', {
        id: String(req.params['id']),
      });
      res.json({ ok: true });
    },
  );

  router.post(
    '/admin/usuarios/:id/ban',
    auth,
    csrf,
    adminMfa,
    async (req, res) => {
      const authz = getAuth(req);
      const targetId = String(req.params['id']);
      if (targetId === authz.user.id) {
        res.status(400).json({ error: 'no_te_podes_banear' });
        return;
      }
      const banned =
        (req.body as { banned?: unknown } | undefined)?.banned !== false;
      await db
        .update(users)
        .set({ bannedAt: banned ? new Date() : null })
        .where(eq(users.id, targetId));
      if (banned) {
        await db.delete(sessions).where(eq(sessions.userId, targetId));
      }
      await audit(ctx, authz.user.id, banned ? 'user.ban' : 'user.unban', {
        id: targetId,
      });
      res.json({ ok: true });
    },
  );

  router.get('/admin/auditoria', auth, adminMfa, async (req, res) => {
    const limit = Math.min(
      200,
      Math.max(
        1,
        Number.parseInt(String(req.query['limit'] ?? '50'), 10) || 50,
      ),
    );
    const rows = await db
      .select()
      .from(auditAdmin)
      .orderBy(desc(auditAdmin.id))
      .limit(limit);
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        adminId: r.adminId,
        action: r.action,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  return router;
}
