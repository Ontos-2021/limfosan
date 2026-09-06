import { describe, expect, it } from 'vitest';
import {
  CommandSchema,
  EngineActionSchema,
  GreetingSchema,
  HealthResponseSchema,
  RegisterSchema,
  TableCodeSchema,
} from '../src/contracts.js';

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

describe('contratos de identidad', () => {
  it('normaliza email e invite code; exige clave larga', () => {
    const parsed = RegisterSchema.safeParse({
      email: '  ANA@Test.Local ',
      password: '0123456789',
      displayName: 'Ana',
      inviteCode: 'beta-abc1',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('ana@test.local');
      expect(parsed.data.inviteCode).toBe('BETA-ABC1');
    }
    expect(
      RegisterSchema.safeParse({
        email: 'a@b.c',
        password: 'corta',
        displayName: 'A',
      }).success,
    ).toBe(false);
  });

  it('códigos de mesa: 6 alfanuméricos en mayúsculas', () => {
    expect(TableCodeSchema.safeParse('ab12cd').success).toBe(true);
    expect(TableCodeSchema.parse('ab12cd')).toBe('AB12CD');
    expect(TableCodeSchema.safeParse('ABC').success).toBe(false);
    expect(TableCodeSchema.safeParse('ABC-12').success).toBe(false);
  });
});

describe('contratos de partida', () => {
  it('acepta jugadas y cantos válidos', () => {
    expect(
      EngineActionSchema.safeParse({ type: 'play', card: '1-espada' }).success,
    ).toBe(true);
    expect(EngineActionSchema.safeParse({ type: 'truco' }).success).toBe(true);
  });

  it('rechaza cartas y acciones inválidas', () => {
    expect(
      EngineActionSchema.safeParse({ type: 'play', card: '8-oro' }).success,
    ).toBe(false);
    expect(
      EngineActionSchema.safeParse({ type: 'play', card: '1-espadas' }).success,
    ).toBe(false);
    expect(
      EngineActionSchema.safeParse({ type: 'truco', card: 'x' }).success,
    ).toBe(false);
    expect(EngineActionSchema.safeParse({ type: 'hacerTrampa' }).success).toBe(
      false,
    );
  });

  it('el comando exige UUID + acción', () => {
    expect(
      CommandSchema.safeParse({
        commandId: 'no-es-uuid',
        action: { type: 'truco' },
      }).success,
    ).toBe(false);
    expect(
      CommandSchema.safeParse({
        commandId: '123e4567-e89b-12d3-a456-426614174000',
        action: { type: 'truco' },
      }).success,
    ).toBe(true);
  });

  it('solo saludos predefinidos', () => {
    expect(GreetingSchema.safeParse({ text: '¡Buena mano!' }).success).toBe(
      true,
    );
    expect(GreetingSchema.safeParse({ text: 'hola' }).success).toBe(false);
  });
});
