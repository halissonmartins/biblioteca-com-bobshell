/**
 * vitest.config.ts — packages/web
 *
 * Arquivo separado do vite.config.ts de propósito: o Vitest não faz merge dos
 * dois, então este replica alias e plugin React sem herdar o proxy de dev.
 */

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Camada lógica do SPA: utils e clientes HTTP. pages/ e components/ ficam
      // fora do alvo de cobertura — comportamento de UI se prova na suíte E2E
      // Playwright, que dirige a interface real (e2e/).
      //
      // Isso não proíbe teste de componente: existe um carve-out para o cenário
      // que a E2E não alcança (ver ADR-0006). `pages/LoginPage.test.tsx` é o
      // caso — reproduzir o Keycloak fora do ar exige interceptar a rede, que a
      // e2e/AGENTS.md proíbe naquela suíte. Ele roda, mas não entra na conta.
      include: ['src/utils/**/*.ts', 'src/api/**/*.ts'],
      exclude: ['src/**/*.test.*'],
      reporter: ['text', 'lcov'],
      thresholds: {
        global: {
          statements: 70,
          branches: 70,
          functions: 70,
          lines: 70,
        },
      },
    },
  },
})
