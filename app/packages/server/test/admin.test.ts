import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestStack,
  request,
  truncateBetweenTests,
  type TestStack,
} from './helpers.js';
import { totpCodeAt } from '../src/auth/totp.js';
import { users } from '../src/db/index.js';

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.close();
});

truncateBetweenTests(() => stack.handle);

async function bootstrapAdmin() {
  const agent = request.agent(stack.app);
  const res = await agent.post('/api/auth/register').send({
    email: 'admin@test.local',
    password: 'clave-admin-segura-1',
    displayName: 'Admin',
    inviteCode: 'ADMIN-UNICO-1',
  });
  expect(res.status).toBe(201);
  return agent;
}

async function csrfOf(
  agent: ReturnType<typeof request.agent>,
): Promise<string> {
  const me = await agent.get('/api/auth/me');
  return me.body.csrfToken as string;
}

describe('admin con MFA', () => {
  it('enroll → verify → login con TOTP habilita el panel', async () => {
    const agent = await bootstrapAdmin();
    let csrf = await csrfOf(agent);

    const enroll = await agent
      .post('/api/admin/mfa/enroll')
      .set('x-csrf-token', csrf)
      .send({});
    expect(enroll.status).toBe(200);
    const secret = enroll.body.secret as string;
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(enroll.body.otpauthUrl).toContain('otpauth://totp/');

    // Sin MFA verificada, el panel responde 403.
    const blocked = await agent.get('/api/admin/flags');
    expect(blocked.status).toBe(403);

    const verify = await agent
      .post('/api/admin/mfa/verify')
      .set('x-csrf-token', csrf)
      .send({ totp: totpCodeAt(secret, Date.now()) });
    expect(verify.status).toBe(200);

    const flags = await agent.get('/api/admin/flags');
    expect(flags.status).toBe(200);
    expect(flags.body.flags).toContainEqual({
      key: 'new_tables',
      enabled: true,
    });

    // Nueva sesión: exige el paso 2 (login + TOTP).
    const agent2 = request.agent(stack.app);
    await agent2.post('/api/auth/login').send({
      email: 'admin@test.local',
      password: 'clave-admin-segura-1',
    });
    csrf = await csrfOf(agent2);
    expect((await agent2.get('/api/admin/flags')).status).toBe(403);
    const bad = await agent2
      .post('/api/admin/login')
      .set('x-csrf-token', csrf)
      .send({
        email: 'admin@test.local',
        password: 'clave-admin-segura-1',
        totp: '000000',
      });
    expect(bad.status).toBe(401);
    const good = await agent2
      .post('/api/admin/login')
      .set('x-csrf-token', csrf)
      .send({
        email: 'admin@test.local',
        password: 'clave-admin-segura-1',
        totp: totpCodeAt(secret, Date.now()),
      });
    expect(good.status).toBe(200);
    expect((await agent2.get('/api/admin/flags')).status).toBe(200);
  });

  it('un usuario común no toca el panel', async () => {
    const agent = request.agent(stack.app);
    await agent.post('/api/session/guest').send({});
    expect((await agent.get('/api/admin/flags')).status).toBe(403);
    expect((await agent.get('/api/admin/metricas')).status).toBe(403);
  });
});

describe('invitaciones, flags, baneos y métricas', () => {
  async function adminAgent() {
    const agent = await bootstrapAdmin();
    const csrf = await csrfOf(agent);
    const enroll = await agent
      .post('/api/admin/mfa/enroll')
      .set('x-csrf-token', csrf)
      .send({});
    await agent
      .post('/api/admin/mfa/verify')
      .set('x-csrf-token', csrf)
      .send({ totp: totpCodeAt(enroll.body.secret as string, Date.now()) });
    return agent;
  }

  it('crea y revoca invitaciones', async () => {
    const agent = await adminAgent();
    const csrf = await csrfOf(agent);
    const created = await agent
      .post('/api/admin/invites')
      .set('x-csrf-token', csrf)
      .send({ label: 'beta', maxUses: 5 });
    expect(created.status).toBe(201);
    const code = created.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const listed = await agent.get('/api/admin/invites');
    expect(listed.body.invites.map((i: { code: string }) => i.code)).toContain(
      code,
    );

    // La invitación sirve para registrarse.
    const reg = await request(stack.app).post('/api/auth/register').send({
      email: 'invitado@test.local',
      password: 'clave-segura-123',
      displayName: 'Invitado',
      inviteCode: code,
    });
    expect(reg.status).toBe(201);

    const id = listed.body.invites.find(
      (i: { code: string }) => i.code === code,
    ).id as string;
    const revoked = await agent
      .post(`/api/admin/invites/${id}/revocar`)
      .set('x-csrf-token', csrf)
      .send({});
    expect(revoked.status).toBe(200);
    const reg2 = await request(stack.app).post('/api/auth/register').send({
      email: 'otro@test.local',
      password: 'clave-segura-123',
      displayName: 'Otro',
      inviteCode: code,
    });
    expect(reg2.status).toBe(400);
  });

  it('kill-switch new_tables pausa crear mesas y unirse', async () => {
    const agent = await adminAgent();
    const csrf = await csrfOf(agent);
    const set = await agent
      .post('/api/admin/flags/new_tables')
      .set('x-csrf-token', csrf)
      .send({ enabled: false });
    expect(set.status).toBe(200);

    const guest = request.agent(stack.app);
    await guest.post('/api/session/guest').send({});
    const me = await guest.get('/api/auth/me');
    const blocked = await guest
      .post('/api/mesas')
      .set('x-csrf-token', me.body.csrfToken as string)
      .send({});
    expect(blocked.status).toBe(503);

    await agent
      .post('/api/admin/flags/new_tables')
      .set('x-csrf-token', csrf)
      .send({ enabled: true });
    const allowed = await guest
      .post('/api/mesas')
      .set('x-csrf-token', me.body.csrfToken as string)
      .send({});
    expect(allowed.status).toBe(201);
  });

  it('banea y desbanea usuarios; el baneado queda fuera', async () => {
    const agent = await adminAgent();
    const csrf = await csrfOf(agent);
    const victim = request.agent(stack.app);
    const guest = await victim.post('/api/session/guest').send({});
    const victimId = guest.body.user.id as string;

    const ban = await agent
      .post(`/api/admin/usuarios/${victimId}/ban`)
      .set('x-csrf-token', csrf)
      .send({ banned: true });
    expect(ban.status).toBe(200);
    expect((await victim.get('/api/auth/me')).status).toBe(401);

    const unban = await agent
      .post(`/api/admin/usuarios/${victimId}/ban`)
      .set('x-csrf-token', csrf)
      .send({ banned: false });
    expect(unban.status).toBe(200);
    const [row] = await stack.handle.db
      .select()
      .from(users)
      .where(eq(users.id, victimId))
      .limit(1);
    expect(row.bannedAt).toBeNull();
  });

  it('métricas y auditoría registran la actividad', async () => {
    const agent = await adminAgent();
    // Genera actividad: una mesa creada.
    const guest = request.agent(stack.app);
    await guest.post('/api/session/guest').send({});
    const me = await guest.get('/api/auth/me');
    await guest
      .post('/api/mesas')
      .set('x-csrf-token', me.body.csrfToken as string)
      .send({});

    const metrics = await agent.get('/api/admin/metricas?days=7');
    expect(metrics.status).toBe(200);
    const today = metrics.body.metrics.find(
      (m: { day: string }) => m.day === new Date().toISOString().slice(0, 10),
    );
    expect(today.tablesCreated).toBeGreaterThanOrEqual(1);

    const audit = await agent.get('/api/admin/auditoria?limit=20');
    expect(audit.status).toBe(200);
    expect(
      audit.body.entries.some(
        (e: { action: string }) => e.action === 'admin.mfa_enabled',
      ),
    ).toBe(true);
  });

  it('lista y atiende reportes', async () => {
    const agent = await adminAgent();
    const csrf = await csrfOf(agent);
    const reporter = request.agent(stack.app);
    await reporter.post('/api/session/guest').send({});
    const me = await reporter.get('/api/auth/me');
    const created = await reporter
      .post('/api/reportes')
      .set('x-csrf-token', me.body.csrfToken as string)
      .send({
        reason: 'Insultos en el chat',
        reportedUserId: me.body.user.id as string,
      });
    expect(created.status).toBe(201);

    const listed = await agent.get('/api/admin/reportes');
    expect(listed.body.reports).toHaveLength(1);
    const id = listed.body.reports[0].id as string;
    const handled = await agent
      .post(`/api/admin/reportes/${id}/atender`)
      .set('x-csrf-token', csrf)
      .send({});
    expect(handled.status).toBe(200);
  });
});
