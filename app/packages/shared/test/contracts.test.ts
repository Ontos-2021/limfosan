import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '../src/contracts.js';

describe('HealthResponse', () => {
  it('acepta una respuesta de identidad válida', () => {
    const parsed = HealthResponseSchema.safeParse({
      status: 'ok',
      app: 'truco',
      version: '0.1.0-dev',
      env: 'test',
      commit: 'abc1234',
      node: 'v24.0.0',
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza una respuesta de otra aplicación', () => {
    const parsed = HealthResponseSchema.safeParse({
      status: 'ok',
      app: 'otra-app',
      version: '1.0.0',
      env: 'production',
      commit: 'abc1234',
      node: 'v24.0.0',
    });
    expect(parsed.success).toBe(false);
  });
});
