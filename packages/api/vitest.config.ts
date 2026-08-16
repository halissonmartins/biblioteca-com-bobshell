/**
 * vitest.config.ts — packages/api
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // src/infra/telemetry/** só é carregado pelo processo servidor
      // (src/index.ts), nunca pelos testes — contaria como 0% de cobertura.
      exclude: ['src/index.ts', 'src/infra/telemetry/**', 'src/**/*.test.ts'],
    },
  },
});
