import { defineConfig, devices } from '@playwright/test'

/**
 * E2E — dirige a UI real (Vite :5173) que consome a API (:3000) + Postgres.
 *
 * Local:  docker compose up -d  &&  npm install  &&  npm test   (nesta pasta)
 * CI:     job `e2e-ci` em .github/workflows/ci.yml
 *
 * webServer sobe API e Web automaticamente; globalSetup aplica migrations + seed.
 */

const API_PORT = 3000
const WEB_PORT = 5173

const apiEnv = {
  DATABASE_URL:
    process.env['DATABASE_URL'] ??
    'postgresql://biblioteca:biblioteca@localhost:5432/biblioteca',
  JWT_SECRET: process.env['JWT_SECRET'] ?? 'e2e-jwt-secret-string-longa-o-suficiente',
  JWT_REFRESH_SECRET:
    process.env['JWT_REFRESH_SECRET'] ?? 'e2e-jwt-refresh-secret-string-longa',
  PORT: String(API_PORT),
  NODE_ENV: 'development',
  // O e2e sobe a API em modo development; sem isto o exportador OTLP tentaria
  // o Collector a cada 15 s e encheria o log do webServer de erros de conexão
  // quando o perfil `obs` não está no ar.
  OTEL_SDK_DISABLED: 'true',
}

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm --prefix ../packages/api run dev',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: 'npm --prefix ../packages/web run dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
})
