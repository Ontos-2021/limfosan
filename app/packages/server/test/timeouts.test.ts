import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '@limfosan/shared';
import { ioClient, request, type ClientSocket } from './helpers.js';
import { createTestStack, type TestStack } from './helpers.js';

async function guestCookie(stack: TestStack, name: string): Promise<string> {
  const res = await request(stack.app)
    .post('/api/session/guest')
    .send({ displayName: name });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'] as unknown as string[];
  const sid = /mesa_sid=([^;]+)/.exec(raw.join(';'))?.[1];
  if (!sid) throw new Error('sin cookie');
  return `mesa_sid=${sid}`;
}

async function guestCsrf(stack: TestStack, cookie: string): Promise<string> {
  const me = await request(stack.app).get('/api/auth/me').set('Cookie', cookie);
  return me.body.csrfToken as string;
}

async function createTable(stack: TestStack, cookie: string): Promise<string> {
  const csrf = await guestCsrf(stack, cookie);
  const res = await request(stack.app)
    .post('/api/mesas')
    .set('Cookie', cookie)
    .set('x-csrf-token', csrf)
    .send({});
  expect(res.status).toBe(201);
  return res.body.code as string;
}

function connect(url: string, cookie: string): Promise<ClientSocket> {
  const socket = ioClient(url, {
    extraHeaders: { cookie },
    transports: ['websocket', 'polling'],
  }) as ClientSocket;
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('sin conexión socket')), 10000);
  });
}

function emitAck<T>(
  socket: ClientSocket,
  event: string,
  ...args: unknown[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout en ${event}`)),
      10000,
    );
    const emit = socket.emit.bind(socket) as (...call: unknown[]) => unknown;
    emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

describe('timeouts de turno y gracia', () => {
  let fast: TestStack;
  let responder: TestStack;
  let grace: TestStack;

  beforeAll(async () => {
    fast = await createTestStack({ TURN_PLAY_SECONDS: '1' });
    responder = await createTestStack({ TURN_RESPOND_SECONDS: '1' });
    grace = await createTestStack({ GRACE_SECONDS: '1', MAX_RECONNECTS: '0' });
  });

  afterAll(async () => {
    await fast.close();
    await responder.close();
    await grace.close();
  });

  it('sin jugar a tiempo, el servidor juega la carta más baja', async () => {
    const ca = await guestCookie(fast, 'Lento A');
    const cb = await guestCookie(fast, 'Lento B');
    const code = await createTable(fast, ca);
    const sa = await connect(fast.url, ca);
    const sb = await connect(fast.url, cb);
    try {
      await emitAck(sa, 'mesa:unirse', { code });
      await emitAck(sb, 'mesa:unirse', { code });
      // Nadie actúa: el timer (1 s) juega por p0.
      const estado = await new Promise<MatchSnapshot>((resolve) => {
        sb.on('mesa:estado', (snap: MatchSnapshot) => {
          if (snap.hand.played.length >= 1) resolve(snap);
        });
      });
      expect(estado.hand.played).toHaveLength(1);
      expect(estado.hand.toPlay).toBe('p1');
    } finally {
      sa.disconnect();
      sb.disconnect();
    }
  });

  it('sin responder un canto, vale como "no quiero"', async () => {
    const ca = await guestCookie(responder, 'Canto A');
    const cb = await guestCookie(responder, 'Canto B');
    const code = await createTable(responder, ca);
    const sa = await connect(responder.url, ca);
    const sb = await connect(responder.url, cb);
    try {
      await emitAck(sa, 'mesa:unirse', { code });
      await emitAck(sb, 'mesa:unirse', { code });
      const truco = await emitAck<{ ok: boolean }>(sa, 'mesa:accion', {
        commandId: randomUUID(),
        action: { type: 'truco' },
      });
      expect(truco.ok).toBe(true);
      // B no responde: al segundo, no-quiero automático → A suma 1.
      const fin = await new Promise<MatchSnapshot>((resolve) => {
        sa.on('mesa:estado', (snap: MatchSnapshot) => {
          if (snap.scores.p0 >= 1) resolve(snap);
        });
      });
      expect(fin.scores).toEqual({ p0: 1, p1: 0 });
    } finally {
      sa.disconnect();
      sb.disconnect();
    }
  });

  it('desconexión sin regreso = abandono; tope de reconexiones', async () => {
    const ca = await guestCookie(grace, 'Firme A');
    const cb = await guestCookie(grace, 'Ido B');
    const code = await createTable(grace, ca);
    const sa = await connect(grace.url, ca);
    const sb = await connect(grace.url, cb);
    const fin = new Promise<MatchSnapshot>((resolve) => {
      sa.on('mesa:estado', (snap: MatchSnapshot) => {
        if (snap.table.status === 'finished') resolve(snap);
      });
    });
    try {
      await emitAck(sa, 'mesa:unirse', { code });
      await emitAck(sb, 'mesa:unirse', { code });
      // A juega para que le toque a B, y B se desconecta.
      const snap0 = await emitAck<{ ok: boolean; snapshot: MatchSnapshot }>(
        sa,
        'mesa:unirse',
        {
          code,
        },
      );
      const play = snap0.snapshot.allowed.find((x) => x.type === 'play');
      if (!play) throw new Error('A sin jugadas');
      await emitAck(sa, 'mesa:accion', {
        commandId: randomUUID(),
        action: play,
      });
      sb.disconnect();
      const end = await fin;
      expect(end.result?.reason).toBe('abandono');
      expect(end.result?.winner).toBe('p0');
    } finally {
      sa.disconnect();
    }
  });
});
