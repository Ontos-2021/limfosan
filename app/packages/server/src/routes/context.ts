import type { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { DbHandle } from '../db/index.js';
import type { EmailSender } from '../email.js';

/** Dependencias inyectadas a las rutas (testeables sin singletons). */
export interface RouteContext {
  config: AppConfig;
  db: DbHandle['db'];
  sender: EmailSender;
}

export interface ValidationError {
  error: 'invalid_input';
  fields: string[];
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; error: ValidationError } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.') || 'body');
    return { ok: false, error: { error: 'invalid_input', fields } };
  }
  return { ok: true, data: parsed.data };
}
