import { test, expect } from '@playwright/test'
import { API, apiLogin, apiBookByTitle, LEITOR, BIBLIOTECARIO } from './helpers'

/**
 * Critérios de aceite "via API" das user stories (RN-2, RN-3, RN-7):
 * autorização por papel e regra de disponibilidade, verificadas no contrato HTTP.
 */
test.describe('Autorização e regras via API (RN-2, RN-3, RN-7)', () => {
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })

  test('Leitor não acessa gestão de Reservas nem Empréstimos (403)', async ({ request }) => {
    const { token } = await apiLogin(request, LEITOR.email)
    expect((await request.get(`${API}/reservations`, { headers: bearer(token) })).status()).toBe(403)
    expect((await request.get(`${API}/loans`, { headers: bearer(token) })).status()).toBe(403)
  })

  test('Leitor não efetiva Empréstimo nem registra Devolução (403 — US-10, US-11)', async ({ request }) => {
    const { token } = await apiLogin(request, LEITOR.email)
    const loan = await request.post(`${API}/loans`, {
      headers: bearer(token),
      data: { reservationId: 'qualquer', dueAt: '2026-12-01T10:00:00Z' },
    })
    expect(loan.status()).toBe(403)

    const ret = await request.patch(`${API}/loans/qualquer/return`, { headers: bearer(token) })
    expect(ret.status()).toBe(403)
  })

  test('Bibliotecário não cria Reserva nem acessa área do Leitor (403)', async ({ request }) => {
    const { token } = await apiLogin(request, BIBLIOTECARIO.email)
    const res = await request.post(`${API}/reservations`, { headers: bearer(token), data: { bookId: 'x' } })
    expect(res.status()).toBe(403)
    expect((await request.get(`${API}/me/reservations`, { headers: bearer(token) })).status()).toBe(403)
    expect((await request.get(`${API}/me/loans`, { headers: bearer(token) })).status()).toBe(403)
  })

  test('acesso sem token é rejeitado (401)', async ({ request }) => {
    expect((await request.get(`${API}/me/reservations`)).status()).toBe(401)
    expect((await request.get(`${API}/reservations`)).status()).toBe(401)
  })

  test('RN-3 — reservar Livro sem Cópia disponível retorna 409', async ({ request }) => {
    const { token } = await apiLogin(request, LEITOR.email)
    // "Ensaio sobre a Cegueira" está sem cópias disponíveis no seed
    const book = await apiBookByTitle(request, 'Ensaio sobre a Cegueira')
    expect(book.availableCopies).toBe(0)
    const res = await request.post(`${API}/reservations`, { headers: bearer(token), data: { bookId: book.id } })
    expect(res.status()).toBe(409)
  })
})
