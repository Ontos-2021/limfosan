import { and, gte, lte, sql } from 'drizzle-orm';
import { metricsDaily, type DbHandle } from './db/index.js';

export type MetricKind =
  | 'tables_created'
  | 'matches_completed'
  | 'match_abandons'
  | 'signups'
  | 'guest_upgrades';

const COLUMNS: Record<
  MetricKind,
  | 'tablesCreated'
  | 'matchesCompleted'
  | 'matchAbandons'
  | 'signups'
  | 'guestUpgrades'
> = {
  tables_created: 'tablesCreated',
  matches_completed: 'matchesCompleted',
  match_abandons: 'matchAbandons',
  signups: 'signups',
  guest_upgrades: 'guestUpgrades',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Suma 1 a la métrica del día (upsert atómico). */
export async function bumpMetric(
  db: DbHandle['db'],
  kind: MetricKind,
): Promise<void> {
  const column = metricsDaily[COLUMNS[kind]];
  await db
    .insert(metricsDaily)
    .values({ day: todayISO(), [COLUMNS[kind]]: 1 })
    .onConflictDoUpdate({
      target: metricsDaily.day,
      set: { [COLUMNS[kind]]: sql`${column} + 1` },
    });
}

export interface DailyMetrics {
  day: string;
  tablesCreated: number;
  matchesCompleted: number;
  matchAbandons: number;
  signups: number;
  guestUpgrades: number;
}

export async function getMetrics(
  db: DbHandle['db'],
  days: number,
): Promise<DailyMetrics[]> {
  const to = todayISO();
  const fromDate = new Date(Date.now() - (days - 1) * 86400_000);
  const from = fromDate.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(metricsDaily)
    .where(and(gte(metricsDaily.day, from), lte(metricsDaily.day, to)))
    .orderBy(metricsDaily.day);
  return rows.map((r) => ({
    day: r.day,
    tablesCreated: r.tablesCreated,
    matchesCompleted: r.matchesCompleted,
    matchAbandons: r.matchAbandons,
    signups: r.signups,
    guestUpgrades: r.guestUpgrades,
  }));
}
