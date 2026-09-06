import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Esquema de la plataforma (E2 + E4).
 * Migraciones versionadas en `drizzle/`; se aplican al arrancar con `migrate()`.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** guest (invitado) → user (cuenta) → admin. */
  role: varchar('role', { length: 16 }).notNull().default('guest'),
  displayName: varchar('display_name', { length: 24 }).notNull(),
  email: varchar('email', { length: 254 }).unique(),
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Token CSRF sincronizado de esta sesión (se renueva al rotar). */
  csrfToken: text('csrf_token').notNull(),
  /** true tras verificar TOTP en login admin (step-up). */
  mfaVerified: boolean('mfa_verified').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  ip: varchar('ip', { length: 64 }),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 24 }).notNull().unique(),
  label: varchar('label', { length: 80 }),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revoked: boolean('revoked').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'verify' | 'reset'. */
    purpose: varchar('purpose', { length: 16 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('email_tokens_hash_uniq').on(t.tokenHash)],
);

export const tables = pgTable('tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Código humano de 6 caracteres para compartir por enlace. */
  code: varchar('code', { length: 6 }).notNull().unique(),
  /** waiting (falta rival) | playing | finished. */
  status: varchar('status', { length: 16 }).notNull().default('waiting'),
  hostUserId: uuid('host_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  /** Votos de revancha: ['p0','p1'] como JSON. */
  rematchVotes: jsonb('rematch_votes').notNull().default([]),
  newTableId: uuid('new_table_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const tableSeats = pgTable(
  'table_seats',
  {
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    /** 'p0' | 'p1'. */
    seat: varchar('seat', { length: 2 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    reconnects: integer('reconnects').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    unique('table_seats_pk').on(t.tableId, t.seat),
    unique('table_seats_user_uniq').on(t.tableId, t.userId),
  ],
);

export const games = pgTable('games', {
  tableId: uuid('table_id')
    .primaryKey()
    .references(() => tables.id, { onDelete: 'cascade' }),
  /** MatchState completo del motor (privado: vive solo en servidor/DB). */
  state: jsonb('state').notNull(),
  /** Versión optimista = cantidad de eventos aplicados. */
  version: integer('version').notNull().default(0),
  rulesVersion: varchar('rules_version', { length: 8 }).notNull().default('v1'),
  seed: integer('seed').notNull(),
  /** { winner, scores, reason, bySeat } al terminar. */
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gameEvents = pgTable(
  'game_events',
  {
    id: serial('id').primaryKey(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    /** commandId del cliente: repetido = mismo efecto (idempotencia). */
    commandId: varchar('command_id', { length: 64 }).notNull(),
    actor: varchar('actor', { length: 2 }),
    action: jsonb('action').notNull(),
    server: boolean('server').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('game_events_command_uniq').on(t.tableId, t.commandId),
    unique('game_events_seq_uniq').on(t.tableId, t.seq),
    index('game_events_table_idx').on(t.tableId),
  ],
);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reportedUserId: uuid('reported_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  tableId: uuid('table_id').references(() => tables.id, {
    onDelete: 'set null',
  }),
  reason: text('reason').notNull(),
  handled: boolean('handled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 64 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 32 }).notNull(),
  payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  doneAt: timestamp('done_at', { withTimezone: true }),
});

export const metricsDaily = pgTable('metrics_daily', {
  day: date('day').primaryKey(),
  tablesCreated: integer('tables_created').notNull().default(0),
  matchesCompleted: integer('matches_completed').notNull().default(0),
  matchAbandons: integer('match_abandons').notNull().default(0),
  signups: integer('signups').notNull().default(0),
  guestUpgrades: integer('guest_upgrades').notNull().default(0),
});

export const auditAdmin = pgTable('audit_admin', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  adminId: uuid('admin_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  action: varchar('action', { length: 64 }).notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type DbTable = typeof tables.$inferSelect;
export type TableSeat = typeof tableSeats.$inferSelect;
