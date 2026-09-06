import { defineConfig, devices } from '@playwright/test';

// Los tests online usan una BD propia (truco_e2e), creada por el backend
// al arrancar con DB_AUTOCREATE=1. No interfiere con vitest ni con dev.
const baseDatabaseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://truco:truco@127.0.0.1:5433/truco';
const e2eDatabaseUrl = baseDatabaseUrl.replace(/\/[^/]*$/, '/truco_e2e');

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } },
    },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -w @limfosan/server',
      url: 'http://127.0.0.1:3210/api/health',
      reuseExistingServer: false,
      cwd: '../..',
      timeout: 120000,
      env: {
        ...process.env,
        PORT: '3210',
        NODE_ENV: 'test',
        DATABASE_URL: e2eDatabaseUrl,
        DB_AUTOCREATE: '1',
        SESSION_SECRET: 'secreto-e2e-con-mas-de-32-caracteres-ok',
        APP_URL: 'http://127.0.0.1:5178',
        ADMIN_EMAIL: 'admin@e2e.local',
        ADMIN_BOOTSTRAP_CODE: 'E2E-ADMIN-1',
        ALLOW_INSECURE_COOKIES: '1',
      } as Record<string, string>,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        E2E_BACKEND: 'http://127.0.0.1:3210',
      } as Record<string, string>,
    },
  ],
});
