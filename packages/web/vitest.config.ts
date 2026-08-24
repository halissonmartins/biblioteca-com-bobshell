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
      // Camada lógica do SPA: utils e clientes HTTP. pages/ e components/ são
      // comportamento de UI — cobertos pelas suítes E2E Playwright que dirigem
      // a interface real (e2e/), não por teste unitário.
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
