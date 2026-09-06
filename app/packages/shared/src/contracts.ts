import { z } from 'zod';

/**
 * Respuesta del healthcheck con identidad de la aplicación.
 * El chequeo valida identidad (app + versión), no solo un 200.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  app: z.literal('truco'),
  version: z.string().min(1),
  env: z.string().min(1),
  commit: z.string().min(1),
  node: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
