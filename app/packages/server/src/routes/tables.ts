import { TableCodeSchema } from '@limfosan/shared';
import { Router } from 'express';
import { requireCsrf } from '../auth/csrf.js';
import { getAuth, requireAuth } from '../auth/sessions.js';
import type { MatchManager } from '../game/manager.js';
import { getFlag } from '../flags.js';
import { clientIp, testableRateLimit } from '../ratelimit.js';
import type { RouteContext } from './context.js';

export interface TablesContext extends RouteContext {
  manager: MatchManager;
}

/** Mesas: crear por REST; unirse/jugar por socket (una sola vía de join). */
export function tablesRoutes(ctx: TablesContext): Router {
  const { db, manager } = ctx;
  const router = Router();
  const auth = requireAuth(db);
  const csrf = requireCsrf();

  const limitCreate = testableRateLimit(process.env, {
    windowMs: 60_000,
    max: 10,
    key: (req) => `mesa-crear:${clientIp(req)}`,
  });

  router.post('/mesas', auth, csrf, limitCreate, async (req, res) => {
    const authz = getAuth(req);
    if (!(await getFlag(db, 'new_tables'))) {
      res.status(503).json({ error: 'mesas_pausadas' });
      return;
    }
    const { code } = await manager.createTable(authz.user.id);
    res.status(201).json({ code });
  });

  router.get('/mesas/:code', auth, async (req, res) => {
    const parsed = TableCodeSchema.safeParse(req.params['code']);
    if (!parsed.success) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      const match = await manager.getOrLoadByCode(parsed.data);
      const authz = getAuth(req);
      const mine = [...match.seats.values()].find(
        (s) => s.userId === authz.user.id,
      );
      res.json({
        code: match.code,
        status: match.status,
        seats: [...match.seats.values()].map((s) => ({
          seat: s.seat,
          name: s.name,
          online: s.online,
          you: s.seat === mine?.seat,
        })),
        scores: match.status === 'waiting' ? null : { ...match.state.scores },
        mySeat: mine?.seat ?? null,
      });
    } catch {
      res.status(404).json({ error: 'not_found' });
    }
  });

  return router;
}
