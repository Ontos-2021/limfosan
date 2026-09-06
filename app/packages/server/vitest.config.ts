import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests comparten una sola BD de pruebas: corren en serie con
    // truncate entre tests para aislamiento total.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    globalSetup: './test/global-setup.ts',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
