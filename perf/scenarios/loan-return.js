// loan-return.js — fluxo de escrita completo, medindo RNF-2 e RNF-3.
// Cadeia por iteração (RN-6: só reserva ativa vira Empréstimo; RN-5: Devolução
// libera a Cópia — o que mantém o cenário repetível, sem esgotar o estoque):
//   1. leitor        POST  /reservations   → reservationId   (métrica: reservation, RNF-2 < 3 s)
//   2. bibliotecário POST  /loans          → loanId          (métrica: loan,        RNF-3 < 3 s)
//   3. bibliotecário PATCH /loans/:id/return                  (métrica: return,      RNF-3 < 3 s)
//
// 409 na reserva (sem Cópia disponível — RN-3) é resultado esperado sob contenção;
// expectStatuses evita que conte como falha, e a iteração apenas pula a cadeia.

import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { writeOptions } from '../lib/config.js';
import { timed, expectStatuses } from '../lib/http.js';
import { fullSetup, pick } from '../lib/setup.js';

expectStatuses(200, 201, 409);

const soldOut = new Counter('reservation_sold_out'); // 409 esperados

export const options = writeOptions({
  reservation: ['p(95)<3000'],
  loan: ['p(95)<3000'],
  return: ['p(95)<3000'],
});

export function setup() {
  return fullSetup();
}

export default function (data) {
  // 1. Reserva pelo leitor (RNF-2).
  const bookId = pick(data.bookIds);
  const reserva = timed('reservation', 'POST', '/reservations', {
    token: data.readerToken,
    body: { bookId },
    expected: [201, 409],
  });
  if (reserva.status === 409) {
    soldOut.add(1);
    return; // sem Cópia disponível — pula a cadeia
  }
  const reservationId = reserva.json('data.reservation.id');

  // 2. Empréstimo efetivado pelo bibliotecário (RNF-3).
  const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const emprestimo = timed('loan', 'POST', '/loans', {
    token: data.librarianToken,
    body: { reservationId, dueAt },
    expected: 201,
  });
  if (emprestimo.status !== 201) return;
  const loanId = emprestimo.json('data.loan.id');

  // 3. Devolução — libera a Cópia (RN-5), mantendo o estoque estável (RNF-3).
  const devolucao = timed('return', 'PATCH', `/loans/${loanId}/return`, {
    token: data.librarianToken,
    expected: 200,
  });
  check(devolucao, {
    'devolução preenche returnedAt': (r) => r.json('data.loan.returnedAt') !== null,
  });
}
