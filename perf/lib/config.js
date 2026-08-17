// config.js — configuração compartilhada dos testes de performance K6.
// Todas as variáveis vêm de __ENV (passadas via `k6 run -e VAR=valor` ou ambiente).

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Keycloak — quem emite os tokens (ADR-0009). A API não tem mais /auth/login.
export const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8081';
export const KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'biblioteca';
export const KEYCLOAK_CLIENT_ID = __ENV.KEYCLOAK_CLIENT_ID || 'biblioteca-web';
export const TOKEN_ENDPOINT = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

// Credenciais do realm de desenvolvimento (keycloak/realm-biblioteca.json).
export const READER = {
  email: __ENV.READER_EMAIL || 'leitor@biblioteca.dev',
  password: __ENV.READER_PASSWORD || 'senha123',
};

export const LIBRARIAN = {
  email: __ENV.LIBRARIAN_EMAIL || 'bibliotecario@biblioteca.dev',
  password: __ENV.LIBRARIAN_PASSWORD || 'senha123',
};

// Perfil de carga modesto: o desafio do sistema é LATÊNCIA, não throughput
// (25:1 leitura/escrita, baixo RPS médio — ver PRD §RNF).
export const VUS = Number(__ENV.VUS || 10);
export const DURATION = __ENV.DURATION || '30s';

// Escrita: taxa de chegada baixa (o PRD prevê ~30k reservas/mês → baixo RPS).
// constant-arrival-rate mede latência sem esgotar o estoque de Cópias.
export const WRITE_RATE = Number(__ENV.WRITE_RATE || 10); // iterações por segundo
export const WRITE_DURATION = __ENV.WRITE_DURATION || '30s';

// Catálogo: concorrência modesta — o objetivo é medir LATÊNCIA, não o teto de
// throughput (evita saturar CPU e mascarar o p95 real da busca).
export const SEARCH_VUS = Number(__ENV.SEARCH_VUS || 4);

// Termos de busca presentes nos títulos gerados pelo seed de performance
// (packages/api/prisma/seed-perf.ts) — garantem resultados não vazios.
export const SEARCH_TERMS = [
  'amor',
  'cidade',
  'silêncio',
  'memória',
  'tempo',
  'sombra',
  'luz',
  'rio',
  'casa',
  'vento',
  'mar',
  'estrela',
];

/**
 * Monta o bloco `options` de um cenário de leitura, já com os thresholds
 * globais (taxa de erro < 1%, checks > 99%) mais os thresholds específicos.
 *
 * @param {Record<string, string[]>} thresholds thresholds por métrica
 * @param {{vus?: number, duration?: string}} [load] override do perfil de carga
 */
export function readOptions(thresholds, load = {}) {
  return {
    vus: load.vus ?? VUS,
    duration: load.duration ?? DURATION,
    thresholds: {
      http_req_failed: ['rate<0.01'],
      checks: ['rate>0.99'],
      ...thresholds,
    },
  };
}

/**
 * Bloco `options` para o fluxo de escrita: executor constant-arrival-rate a uma
 * taxa baixa (WRITE_RATE/s), modelando a baixa carga de escrita do PRD.
 *
 * @param {Record<string, string[]>} thresholds thresholds por métrica
 */
export function writeOptions(thresholds) {
  return {
    scenarios: {
      write: {
        executor: 'constant-arrival-rate',
        rate: WRITE_RATE,
        timeUnit: '1s',
        duration: WRITE_DURATION,
        preAllocatedVUs: Math.max(10, WRITE_RATE),
        maxVUs: WRITE_RATE * 5,
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      checks: ['rate>0.99'],
      ...thresholds,
    },
  };
}
