import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit, resetRateLimits } from '../src/ratelimit.js';

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & {
    body: unknown;
    headers: Record<string, string>;
  };
}

describe('rateLimit', () => {
  it('permite hasta el máximo y luego responde 429', () => {
    resetRateLimits();
    const mw = rateLimit({ windowMs: 60_000, max: 2, key: () => 'test' });
    const req = {} as Request;
    let next = 0;
    const nextFn: NextFunction = () => {
      next += 1;
    };
    mw(req, fakeRes(), nextFn);
    mw(req, fakeRes(), nextFn);
    expect(next).toBe(2);
    const res = fakeRes();
    mw(req, res, nextFn);
    expect(next).toBe(2);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(res.headers['Retry-After']).toBeDefined();
  });
});
