// http.js — wrapper de requisição que mede a latência por operação numa Trend
// nomeada e valida o status esperado. Os thresholds dos cenários são declarados
// sobre essas Trends, dando um mapeamento 1:1 com os RNFs do PRD.

import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL } from './config.js';

// Trends por operação — DEVEM ser criadas no init context (topo do módulo);
// o k6 proíbe declarar métricas durante a execução do VU. isTime=true → ms.
const TRENDS = {
  catalog_search: new Trend('catalog_search', true),
  book_detail: new Trend('book_detail', true),
  my_lists: new Trend('my_lists', true),
  reservation: new Trend('reservation', true),
  loan: new Trend('loan', true),
  return: new Trend('return', true),
};

/**
 * Marca os status informados como "esperados" para o k6 (não contam em
 * http_req_failed). Use no init context dos cenários de escrita, onde 409
 * (sem Cópia disponível — RN-3) é um resultado legítimo sob contenção.
 */
export function expectStatuses(...codes) {
  http.setResponseCallback(http.expectedStatuses(...codes));
}

function trendFor(name) {
  const trend = TRENDS[name];
  if (!trend) {
    throw new Error(`Trend não declarada para a operação "${name}" (adicione em lib/http.js)`);
  }
  return trend;
}

/** Header Authorization: Bearer para chamadas autenticadas. */
export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

/**
 * Dispara uma requisição, registra a duração na Trend `metric` e valida o status.
 *
 * @param {string} metric   nome da métrica/Trend (ex.: 'book_detail')
 * @param {string} method   verbo HTTP
 * @param {string} path     caminho relativo (ex.: '/books/123')
 * @param {object} [opts]   { body, token, expected, tags }
 * @returns {import('k6/http').Response}
 */
export function timed(metric, method, path, opts = {}) {
  const { body, token, expected = 200, tags = {} } = opts;
  const params = { tags: { operation: metric, ...tags } };
  if (token) {
    params.headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  } else if (body !== undefined) {
    params.headers = { 'Content-Type': 'application/json' };
  }

  const payload = body !== undefined ? JSON.stringify(body) : null;
  const res = http.request(method, `${BASE_URL}${path}`, payload, params);

  trendFor(metric).add(res.timings.duration, { operation: metric });

  const expectedList = Array.isArray(expected) ? expected : [expected];
  check(res, {
    [`${metric}: status ${expectedList.join('/')}`]: (r) => expectedList.includes(r.status),
  });

  return res;
}
