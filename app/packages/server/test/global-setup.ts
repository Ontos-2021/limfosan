import { Client } from 'pg';
import { migrateDb } from '../src/db/client.js';
import { createDb } from '../src/db/client.js';

function testDatabaseUrl(): string {
  return (
    process.env['TEST_DATABASE_URL'] ??
    'postgres://truco:truco@127.0.0.1:5433/truco_test'
  );
}

/** Crea la BD de pruebas si falta y aplica migraciones (una vez por corrida). */
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
  const handle = createDb(testDatabaseUrl());
  try {
    await migrateDb(handle.db);
  } finally {
    await handle.pool.end();
  }
}
