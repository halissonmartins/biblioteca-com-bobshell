// catalog-home.js — a tela inicial: GET /books sem filtro, primeiras páginas.
// Endpoint público, a requisição mais frequente do produto. Existe desde a
// issue #25 para responder se o `count(*)` exato do total — que roda a cada
// troca de página — pesa na escala de 250k Livros. Meta interna p95 < 400 ms,
// a mesma da busca.

import { check } from 'k6';
import { readOptions } from '../lib/config.js';
import { timed } from '../lib/http.js';

export const options = readOptions({
  catalog_home: ['p(95)<400'],
});

export default function () {
  const page = 1 + Math.floor(Math.random() * 5);
  const res = timed('catalog_home', 'GET', `/books?page=${page}&pageSize=20`);
  check(res, {
    'home traz o total do acervo': (r) => r.json('data.pagination.total') > 0,
  });
}
