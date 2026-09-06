import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@limfosan/shared';
import { createApp } from '../src/app.js';

const config = {
  port: 3000,
  env: 'test',
  version: '0.1.0-test',
  commit: 'test',
};

describe('GET /api/health', () => {
  it('responde 200 con la identidad de la app', async () => {
    const res = await request(createApp(config)).get('/api/health');
    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.app).toBe('truco');
      expect(parsed.data.version).toBe('0.1.0-test');
    }
  });
});

describe('rutas API desconocidas', () => {
  it('responde 404 JSON', async () => {
    const res = await request(createApp(config)).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
