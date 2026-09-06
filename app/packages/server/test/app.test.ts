import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@limfosan/shared';
import { createTestStack, request, type TestStack } from './helpers.js';

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.close();
});

describe('GET /api/health', () => {
  it('responde 200 con la identidad de la app', async () => {
    const res = await request(stack.app).get('/api/health');
    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });
});

describe('GET /api/ready', () => {
  it('responde ok cuando la base responde', async () => {
    const res = await request(stack.app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { db: true } });
  });
});

describe('rutas API desconocidas', () => {
  it('responde 404 JSON', async () => {
    const res = await request(stack.app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
