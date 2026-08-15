// smoke.js — sanidade: 1 VU / 1 iteração exercitando todos os endpoints uma vez.
// Roda antes dos cenários de carga para confirmar que a API e o seed estão OK.

import { check } from 'k6';
import { SEARCH_TERMS } from './lib/config.js';
import { timed } from './lib/http.js';
import { fullSetup, pick } from './lib/setup.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return fullSetup();
}

export default function (data) {
  // Catálogo (busca) + detalhes
  timed('catalog_search', 'GET', `/books?search=${encodeURIComponent(pick(SEARCH_TERMS))}&pageSize=20`);
  timed('book_detail', 'GET', `/books/${pick(data.bookIds)}`);

  // Listas do leitor
  timed('my_lists', 'GET', '/me/reservations', { token: data.readerToken });
  timed('my_lists', 'GET', '/me/loans', { token: data.readerToken });

  // Cadeia reserva → empréstimo → devolução
  const reserva = timed('reservation', 'POST', '/reservations', {
    token: data.readerToken,
    body: { bookId: pick(data.bookIds) },
    expected: [201, 409],
  });
  if (reserva.status === 201) {
    const reservationId = reserva.json('data.reservation.id');
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const emprestimo = timed('loan', 'POST', '/loans', {
      token: data.librarianToken,
      body: { reservationId, dueAt },
      expected: 201,
    });
    if (emprestimo.status === 201) {
      const loanId = emprestimo.json('data.loan.id');
      const dev = timed('return', 'PATCH', `/loans/${loanId}/return`, {
        token: data.librarianToken,
        expected: 200,
      });
      check(dev, { 'devolução OK': (r) => r.status === 200 });
    }
  }
}
