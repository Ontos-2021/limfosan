import { z } from 'zod';

/**
 * Respuesta del healthcheck con identidad de la aplicación.
 * El chequeo valida identidad (app + versión), no solo un 200.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  app: z.literal('truquito'),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/* ------------------------------------------------------------------ */
/* Identidad (E2)                                                      */
/* ------------------------------------------------------------------ */

export const DisplayNameSchema = z.string().trim().min(2).max(24);

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export const PasswordSchema = z.string().min(10).max(128);

export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{4,20}$/);

export const TableCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/);

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema,
  inviteCode: InviteCodeSchema.optional(),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(20).max(128),
});

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(128),
  password: PasswordSchema,
});

export const UpdateMeSchema = z.object({
  displayName: DisplayNameSchema,
});

export const GuestEnsureSchema = z.object({
  displayName: DisplayNameSchema.optional(),
});

export const TotpCodeSchema = z.string().regex(/^[0-9]{6}$/);

export const AdminLoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
  totp: TotpCodeSchema,
});

export const AdminMfaVerifySchema = z.object({
  totp: TotpCodeSchema,
});

export const InviteCreateSchema = z.object({
  label: z.string().trim().max(80).optional(),
  maxUses: z.number().int().min(1).max(10000).default(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
});

export const FlagSetSchema = z.object({
  enabled: z.boolean(),
});

export const ReportCreateSchema = z.object({
  reportedUserId: z.string().uuid().optional(),
  tableCode: TableCodeSchema.optional(),
  reason: z.string().trim().min(3).max(500),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

/* ------------------------------------------------------------------ */
/* Partida en línea (E4): acciones y comandos                          */
/* ------------------------------------------------------------------ */

/** Formato de carta del motor: `1-espada`, `12-basto`, … */
export const CardIdSchema = z
  .string()
  .regex(/^(?:[1-7]|10|11|12)-(oro|copa|espada|basto)$/);

export const EngineActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), card: CardIdSchema }).strict(),
  z.object({ type: z.literal('envido') }).strict(),
  z.object({ type: z.literal('realEnvido') }).strict(),
  z.object({ type: z.literal('faltaEnvido') }).strict(),
  z.object({ type: z.literal('quiero') }).strict(),
  z.object({ type: z.literal('noQuiero') }).strict(),
  z.object({ type: z.literal('truco') }).strict(),
  z.object({ type: z.literal('retruco') }).strict(),
  z.object({ type: z.literal('valeCuatro') }).strict(),
  z.object({ type: z.literal('mazo') }).strict(),
]);

export const CommandSchema = z.object({
  commandId: z.string().uuid(),
  action: EngineActionSchema,
});

export type EngineActionInput = z.infer<typeof EngineActionSchema>;
export type CommandInput = z.infer<typeof CommandSchema>;

/** Saludos predefinidos: el único texto que un jugador puede enviar al rival. */
export const GREETINGS = ['¡Buena mano!', '¡Suerte!', '¡Bien jugado!'] as const;

export const GreetingSchema = z.object({
  text: z.enum(GREETINGS),
});

export type Greeting = (typeof GREETINGS)[number];
