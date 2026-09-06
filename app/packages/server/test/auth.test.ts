import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestStack,
  request,
  truncateBetweenTests,
  type TestStack,
} from './helpers.js';
import { invites, users } from '../src/db/index.js';

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.close();
});

truncateBetweenTests(() => stack.handle);

async function seedInvite(code = 'BETA-ABC1'): Promise<void> {
  await stack.handle.db.insert(invites).values({
    code,
    label: 'prueba',
    maxUses: 10,
  });
}

function tokenFromOutbox(index = 0): string {
  const body = stack.sender.outbox[index]?.text ?? '';
  const match = /token=([a-f0-9]{64})/.exec(body);
  if (!match) throw new Error('sin token en el email');
  return match[1];
}

describe('invitados (guest)', () => {
  it('crea sesión de invitado y sobrevive refresh (GET /me)', async () => {
    const agent = request.agent(stack.app);
    const res = await agent.post('/api/session/guest').send({});
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('guest');
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.headers['set-cookie']).toBeDefined();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it('rechaza sin sesión', async () => {
    const res = await request(stack.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('registro con invitación', () => {
  it('exige código cuando REQUIRE_INVITE=true', async () => {
    const res = await request(stack.app).post('/api/auth/register').send({
      email: 'a@test.local',
      password: 'clave-segura-123',
      displayName: 'Ana',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invite_required');
  });

  it('rechaza códigos inválidos', async () => {
    const res = await request(stack.app).post('/api/auth/register').send({
      email: 'a@test.local',
      password: 'clave-segura-123',
      displayName: 'Ana',
      inviteCode: 'NOEXISTE',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invite_invalid');
  });

  it('registra con invitación válida y envía verificación', async () => {
    await seedInvite();
    const res = await request(stack.app).post('/api/auth/register').send({
      email: 'ana@test.local',
      password: 'clave-segura-123',
      displayName: 'Ana',
      inviteCode: 'BETA-ABC1',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.emailVerified).toBe(false);
    expect(stack.sender.outbox).toHaveLength(1);
    expect(stack.sender.outbox[0].to).toBe('ana@test.local');

    const token = tokenFromOutbox();
    const verify = await request(stack.app)
      .post('/api/auth/verify')
      .send({ token });
    expect(verify.status).toBe(200);

    const reuse = await request(stack.app)
      .post('/api/auth/verify')
      .send({ token });
    expect(reuse.status).toBe(400);
  });

  it('promueve al invitado sin perder su identidad', async () => {
    await seedInvite();
    const agent = request.agent(stack.app);
    const guest = await agent.post('/api/session/guest').send({});
    const guestId = guest.body.user.id as string;

    const res = await agent.post('/api/auth/register').send({
      email: 'promo@test.local',
      password: 'clave-segura-123',
      displayName: 'Promo',
      inviteCode: 'BETA-ABC1',
    });
    expect(res.status).toBe(201);
    expect(res.body.upgraded).toBe(true);
    expect(res.body.user.id).toBe(guestId);
  });

  it('rechaza email duplicado', async () => {
    await seedInvite();
    const body = {
      email: 'dupli@test.local',
      password: 'clave-segura-123',
      displayName: 'Uno',
      inviteCode: 'BETA-ABC1',
    };
    expect(
      (await request(stack.app).post('/api/auth/register').send(body)).status,
    ).toBe(201);
    const again = await request(stack.app)
      .post('/api/auth/register')
      .send({ ...body, displayName: 'Dos' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('email_en_uso');
  });
});

describe('bootstrap del admin', () => {
  it('crea al primer admin con el código de un solo uso', async () => {
    const res = await request(stack.app).post('/api/auth/register').send({
      email: 'admin@test.local',
      password: 'clave-admin-segura-1',
      displayName: 'Admin',
      inviteCode: 'ADMIN-UNICO-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('el código bootstrap no sirve dos veces ni para otro email', async () => {
    await request(stack.app).post('/api/auth/register').send({
      email: 'admin@test.local',
      password: 'clave-admin-segura-1',
      displayName: 'Admin',
      inviteCode: 'ADMIN-UNICO-1',
    });
    const other = await request(stack.app).post('/api/auth/register').send({
      email: 'otro@test.local',
      password: 'clave-segura-12345',
      displayName: 'Otro',
      inviteCode: 'ADMIN-UNICO-1',
    });
    expect(other.status).toBe(400);
    expect(other.body.error).toBe('invite_invalid');
  });
});

describe('login, CSRF y logout', () => {
  async function registeredAgent() {
    await seedInvite();
    const agent = request.agent(stack.app);
    await agent.post('/api/auth/register').send({
      email: 'login@test.local',
      password: 'clave-segura-123',
      displayName: 'Login',
      inviteCode: 'BETA-ABC1',
    });
    return agent;
  }

  it('login válido e inválido', async () => {
    await registeredAgent();
    const bad = await request(stack.app).post('/api/auth/login').send({
      email: 'login@test.local',
      password: 'otra-clave-00000',
    });
    expect(bad.status).toBe(401);
    const good = await request(stack.app).post('/api/auth/login').send({
      email: 'login@test.local',
      password: 'clave-segura-123',
    });
    expect(good.status).toBe(200);
    expect(good.body.user.displayName).toBe('Login');
  });

  it('las mutaciones exigen CSRF', async () => {
    const agent = await registeredAgent();
    const noToken = await agent
      .patch('/api/auth/me')
      .send({ displayName: 'Cambiado' });
    expect(noToken.status).toBe(403);
    expect(noToken.body.error).toBe('csrf_invalid');

    const me = await agent.get('/api/auth/me');
    const csrfToken = me.body.csrfToken as string;
    const ok = await agent
      .patch('/api/auth/me')
      .set('x-csrf-token', csrfToken)
      .send({ displayName: 'Cambiado' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.displayName).toBe('Cambiado');
  });

  it('logout destruye la sesión', async () => {
    const agent = await registeredAgent();
    const me = await agent.get('/api/auth/me');
    const out = await agent
      .post('/api/auth/logout')
      .set('x-csrf-token', me.body.csrfToken as string);
    expect(out.status).toBe(200);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('un usuario baneado no puede entrar', async () => {
    await registeredAgent();
    await stack.handle.db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.email, 'login@test.local'));
    const res = await request(stack.app).post('/api/auth/login').send({
      email: 'login@test.local',
      password: 'clave-segura-123',
    });
    expect(res.status).toBe(401);
  });
});

describe('recuperación de clave', () => {
  it('forgot siempre responde ok; reset cambia la clave e invalida sesiones', async () => {
    await seedInvite();
    const agent = request.agent(stack.app);
    await agent.post('/api/auth/register').send({
      email: 'reset@test.local',
      password: 'clave-vieja-1234',
      displayName: 'Reset',
      inviteCode: 'BETA-ABC1',
    });
    const forgot = await request(stack.app)
      .post('/api/auth/password/forgot')
      .send({ email: 'reset@test.local' });
    expect(forgot.status).toBe(200);
    const forgotGhost = await request(stack.app)
      .post('/api/auth/password/forgot')
      .send({ email: 'nadie@test.local' });
    expect(forgotGhost.status).toBe(200);

    const token = tokenFromOutbox(stack.sender.outbox.length - 1);
    const bad = await request(stack.app)
      .post('/api/auth/password/reset')
      .send({ token, password: 'corta' });
    expect(bad.status).toBe(400);
    const ok = await request(stack.app)
      .post('/api/auth/password/reset')
      .send({ token, password: 'clave-nueva-5678' });
    expect(ok.status).toBe(200);

    // La sesión anterior murió con el reset.
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const login = await request(stack.app).post('/api/auth/login').send({
      email: 'reset@test.local',
      password: 'clave-nueva-5678',
    });
    expect(login.status).toBe(200);
  });
});
