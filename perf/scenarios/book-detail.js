// book-detail.js — RNF-1: tela de detalhes do Livro em p95 < 300 ms.
// Endpoint: GET /books/:id (público). Exercita o índice @@index([bookId, status]).

import { check } from 'k6';
import { readOptions } from '../lib/config.js';
import { timed } from '../lib/http.js';
import { publicSetup, pick } from '../lib/setup.js';

export const options = readOptions({
  book_detail: ['p(95)<300'],
});

export function setup() {
  return publicSetup();
}

export default function (data) {
  const id = pick(data.bookIds);
  const res = timed('book_detail', 'GET', `/books/${id}`);
  check(res, {
    'detalhe traz availableCopies': (r) => r.json('data.availableCopies') !== undefined,
  });
}
