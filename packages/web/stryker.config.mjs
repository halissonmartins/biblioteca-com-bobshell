// @ts-check
/**
 * stryker.config.mjs — packages/web
 *
 * Teste de mutação (issue #37, ADR-0006). O `mutate` espelha o alvo de
 * cobertura do vitest.config.ts: a camada lógica do SPA (utils/ e clientes
 * HTTP de api/). pages/ e components/ se provam na suíte E2E (e2e/).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */

// O Stryker força o pool `threads` do Vitest, e trocar `process.env.TZ` dentro
// de um worker thread não muda o fuso do ICU. Os casos de loan.test.ts que
// dependem da noite em UTC-3 só provam algo se o PROCESSO já nasce nesse fuso —
// e os runners de teste herdam o env deste processo. Fuso da biblioteca.
process.env.TZ = 'America/Sao_Paulo';

export default {
  testRunner: 'vitest',
  vitest: {
    // Herda environment jsdom, alias `@` e plugin React.
    configFile: 'vitest.config.ts',
    related: true,
  },
  mutate: ['src/utils/**/*.ts', 'src/api/**/*.ts', '!src/**/*.test.*'],
  ignoreStatic: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  // `break` fixado a partir da linha de base medida (registrada na issue #37):
  // 90,63% na primeira execução, 100% depois da triagem dos sobreviventes.
  // Abaixo dele a execução falha. Suba aos poucos, nunca baixe para passar.
  thresholds: { high: 100, low: 95, break: 95 },
};
