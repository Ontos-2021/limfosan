import { Client } from 'pg';

/**
 * Crea la base indicada en la URL si no existe. SOLO para entornos de
 * prueba (vitest global-setup y backend E2E con DB_AUTOCREATE=1).
 * En producción la base la gestiona el operador (Coolify).
 */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!dbName) throw new Error('DATABASE_URL sin nombre de base.');
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName.replaceAll('"', '')}"`);
    }
  } finally {
    await admin.end();
  }
}
