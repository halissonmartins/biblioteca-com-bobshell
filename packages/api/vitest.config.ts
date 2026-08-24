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
      // Fora do alcance dos testes unitários/de integração (que mockam
      // repositório e não sobem servidor):
      // - index.ts e infra/telemetry/** só carregam no processo servidor;
      // - infra/prisma.ts é o singleton do client com extensão de telemetria;
      // - infra/repositories/** são wrappers finos de Prisma — exercidos de
      //   verdade pelas suítes E2E contra Postgres real;
      // - *Types.ts são declarações de tipos, sem código executável;
      // - src/test/** é o kit de assinatura RS256 dos próprios testes.
      exclude: [
        'src/index.ts',
        'src/infra/telemetry/**',
        'src/infra/prisma.ts',
        'src/infra/repositories/**',
        'src/**/*Types.ts',
        'src/test/**',
        'src/**/*.test.ts',
      ],
      reporter: ['text', 'lcov'],
      // Formato flat do Vitest 2.x — o objeto aninhado sob `global` seria
      // interpretado como threshold de um glob, não como gate global.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
