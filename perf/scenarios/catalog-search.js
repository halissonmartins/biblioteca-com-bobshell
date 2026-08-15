// catalog-search.js — busca do catálogo (foco da branch perf/consultas-catalogo).
// Endpoint: GET /books?search=&page=&pageSize= (público). Sem SLA formal no PRD;
// meta interna p95 < 400 ms. Exercita os índices trigram (pg_trgm) em escala.

import { check } from 'k6';
import { readOptions, SEARCH_TERMS, SEARCH_VUS } from '../lib/config.js';
import { timed } from '../lib/http.js';
import { pick } from '../lib/setup.js';

export const options = readOptions(
  {
    catalog_search: ['p(95)<400'],
  },
  { vus: SEARCH_VUS },
);

export default function () {
  const term = encodeURIComponent(pick(SEARCH_TERMS));
  const page = 1 + Math.floor(Math.random() * 5);
  const res = timed('catalog_search', 'GET', `/books?search=${term}&page=${page}&pageSize=20`);
  check(res, {
    'busca traz paginação': (r) => r.json('data.pagination.total') !== undefined,
  });
}
