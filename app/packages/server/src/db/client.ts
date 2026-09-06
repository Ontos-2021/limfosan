import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: Pool;
}

/** Crea el pool + cliente Drizzle (sin conectar hasta el primer uso). */
export function createDb(databaseUrl: string, extra?: PoolConfig): DbHandle {
  const pool = new Pool({ connectionString: databaseUrl, max: 10, ...extra });
  pool.on('error', (err) => {
    console.error(
      JSON.stringify({ msg: 'error en pool postgres', err: String(err) }),
    );
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Producción: dist/db/client.js → dist/drizzle (copiado en el build).
  const inDist = path.join(here, '..', 'drizzle');
  if (existsSync(inDist)) return inDist;
  // Desarrollo/tests: src/db/client.ts → packages/server/drizzle.
  return path.resolve(here, '..', '..', 'drizzle');
}

/** Aplica migraciones pendientes. Idempotente y seguro de correr en cada arranque. */
export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsDir() });
}

export async function closeDb(handle: DbHandle): Promise<void> {
  await handle.pool.end();
}

/** Chequeo liviano para /api/ready. */
export async function pingDb(handle: DbHandle): Promise<boolean> {
  try {
    await handle.pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
