// reader-lists.js — RNF-4: leitor vê suas reservas e empréstimos em p95 < 500 ms.
// Endpoints: GET /me/reservations e GET /me/loans (papel: leitor).

import { readOptions } from '../lib/config.js';
import { timed } from '../lib/http.js';
import { readerSetup } from '../lib/setup.js';

export const options = readOptions({
  my_lists: ['p(95)<500'],
});

export function setup() {
  return readerSetup();
}

export default function (data) {
  const token = data.readerToken;
  timed('my_lists', 'GET', '/me/reservations', { token });
  timed('my_lists', 'GET', '/me/loans', { token });
}
