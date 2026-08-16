import { defineConfig, devices } from '@playwright/test'

/**
 * Configuração exclusiva da captura de dashboards (`make obs-dashboards`).
 *
 * Deliberadamente SEM `globalSetup` e SEM `webServer`: o config principal roda
 * migrations e seed antes da suíte, o que **apagaria os dados que acabaram de
 * popular os dashboards**. Aqui só apontamos o navegador para o Grafana, que
 * já está no ar com leitura anônima habilitada.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'dashboards.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1600, height: 2200 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
