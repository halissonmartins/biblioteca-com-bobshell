// @ts-check
/**
 * stryker.config.mjs — packages/api
 *
 * Teste de mutação (issue #37, ADR-0006). O `mutate` espelha o alvo de
 * cobertura do vitest.config.ts: código de produção que os testes Vitest
 * alcançam sem banco e sem Keycloak. infra/repositories/** e
 * infra/telemetry/** ficam fora pelo mesmo motivo da cobertura.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
    // Roda só os testes que importam o arquivo mutado.
    related: true,
  },
  mutate: [
    'src/domain/**/*.ts',
    'src/api/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*Types.ts',
  ],
  // Mutante em constante de módulo obriga a recarregar a suíte inteira; o
  // valor de regra (MAX_ACTIVE_RESERVATIONS_PER_READER, 12 h de RN-1) é
  // conferido nos testes pelo comportamento, não pela declaração.
  ignoreStatic: true,
  // Reaproveita o resultado de mutantes cujo código e testes não mudaram.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  // `break` fixado a partir da linha de base medida (registrada na issue #37):
  // 54,86% na primeira execução, 80,87% depois da triagem (domain/ em 100%).
  // O que falta é config de log (requestContext, errorHandler) e rota que só as
  // suítes E2E exercitam (books, authors, health). Abaixo do `break` a execução
  // falha. Suba aos poucos, nunca baixe para passar.
  thresholds: { high: 90, low: 80, break: 78 },
};
