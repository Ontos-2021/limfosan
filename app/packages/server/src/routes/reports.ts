import { ReportCreateSchema } from '@limfosan/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireCsrf } from '../auth/csrf.js';
import { getAuth, requireAuth } from '../auth/sessions.js';
import { reports, tables, users } from '../db/index.js';
import { clientIp, testableRateLimit } from '../ratelimit.js';
import { parseBody, type RouteContext } from './context.js';

/** Reportes de conducta: un jugador reporta a otro (los ve el admin). */
export function reportsRoutes(ctx: RouteContext): Router {
  const { db } = ctx;
  const router = Router();
  const auth = requireAuth(db);
  const csrf = requireCsrf();

  const limitReport = testableRateLimit(process.env, {
    windowMs: 60_000,
    max: 5,
    key: (req) => `reporte:${clientIp(req)}`,
  });

  router.post('/reportes', auth, csrf, limitReport, async (req, res) => {
    const parsed = parseBody(ReportCreateSchema, req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json(parsed.error);
      return;
    }
    const authz = getAuth(req);
    const { reportedUserId, tableCode, reason } = parsed.data;
    if (!reportedUserId && !tableCode) {
      res
        .status(400)
        .json({ error: 'invalid_input', fields: ['reportedUserId'] });
      return;
    }
    let tableId: string | null = null;
    if (tableCode) {
      const [row] = await db
        .select({ id: tables.id })
        .from(tables)
        .where(eq(tables.code, tableCode))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: 'mesa_no_existe' });
        return;
      }
      tableId = row.id;
    }
    if (reportedUserId) {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, reportedUserId))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: 'usuario_no_existe' });
        return;
      }
    }
    await db.insert(reports).values({
      reporterId: authz.user.id,
      reportedUserId: reportedUserId ?? null,
      tableId,
      reason,
    });
    res.status(201).json({ ok: true });
  });

  return router;
}
