import { eq } from 'drizzle-orm';
import { featureFlags, type DbHandle } from './db/index.js';

/**
 * Feature flags persistidos (kill-switch operativo).
 * - new_tables: crear/unirse a mesas (apagado = solo partidas en curso).
 * - registrations: registro de cuentas nuevas (invitados siguen entrando).
 */
export const FLAG_KEYS = ['new_tables', 'registrations'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

const cache = new Map<FlagKey, { value: boolean; at: number }>();
const CACHE_MS = 15_000;

export function clearFlagCache(): void {
  cache.clear();
}

export async function getFlag(
  db: DbHandle['db'],
  key: FlagKey,
): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const [row] = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);
  const value = row ? row.enabled : true;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setFlag(
  db: DbHandle['db'],
  key: FlagKey,
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key, enabled, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, updatedBy, updatedAt: new Date() },
    });
  cache.delete(key);
}

export async function listFlags(
  db: DbHandle['db'],
): Promise<Array<{ key: string; enabled: boolean }>> {
  const rows = await db.select().from(featureFlags);
  const map = new Map(rows.map((r) => [r.key, r.enabled]));
  return FLAG_KEYS.map((key) => ({ key, enabled: map.get(key) ?? true }));
}
