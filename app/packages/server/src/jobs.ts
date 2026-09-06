import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { AppConfig } from './config.js';
import { jobs, type DbHandle } from './db/index.js';
import type { EmailMessage, EmailSender } from './email.js';

export interface EmailJobPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Encola un email transaccional (la cola lo envía con reintentos). */
export async function enqueueEmail(
  db: DbHandle['db'],
  message: EmailMessage,
): Promise<void> {
  const payload: EmailJobPayload = {
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
  await db.insert(jobs).values({
    kind: 'email',
    payload,
    nextRunAt: new Date(),
  });
}

async function claimJob(
  db: DbHandle['db'],
): Promise<{ id: number; payload: unknown } | null> {
  // Toma atómica de un solo job vencido (FOR UPDATE SKIP LOCKED).
  const rows = await db.execute<{
    id: number;
    payload: unknown;
  }>(sql`
    UPDATE jobs SET locked_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE done_at IS NULL
        AND next_run_at <= now()
        AND attempts < max_attempts
        AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
      ORDER BY next_run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, payload
  `);
  const row = rows.rows[0];
  return row ? { id: row.id, payload: row.payload } : null;
}

/** Procesa un job vencido si hay; devuelve true si procesó algo. */
export async function processNextJob(
  db: DbHandle['db'],
  sender: EmailSender,
): Promise<boolean> {
  const job = await claimJob(db);
  if (!job) return false;
  try {
    const payload = job.payload as EmailJobPayload;
    await sender.send({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    await db
      .update(jobs)
      .set({ doneAt: new Date(), lockedAt: null })
      .where(eq(jobs.id, job.id));
  } catch (err) {
    const delayMs = 60_000 * 2 ** Math.min(5, 1); // backoff simple
    await db
      .update(jobs)
      .set({ lockedAt: null, nextRunAt: new Date(Date.now() + delayMs) })
      .where(eq(jobs.id, job.id));
    console.error(
      JSON.stringify({
        msg: 'falló envío de job',
        jobId: job.id,
        err: String(err),
      }),
    );
  }
  return true;
}

/** Bucle de la cola: cada 30 s drena los jobs vencidos. */
export function startJobSweeper(
  config: AppConfig,
  db: DbHandle['db'],
  sender: EmailSender,
): () => void {
  void config;
  let stopped = false;
  let running = false;
  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      for (let i = 0; i < 25; i++) {
        const more = await processNextJob(db, sender);
        if (!more) break;
      }
    } catch (err) {
      console.error(
        JSON.stringify({ msg: 'error en cola de jobs', err: String(err) }),
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function pendingJobCount(db: DbHandle['db']): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(and(isNull(jobs.doneAt), lte(jobs.nextRunAt, new Date())));
  return Number(rows[0]?.count ?? 0);
}
