import { test, expect } from '@playwright/test'
import {
  API,
  apiLogin,
  apiBookByTitle,
  apiCreateReservation,
  bearer,
  newActor,
  LEITOR,
  LEITOR_2,
  BIBLIOTECARIO,
} from './helpers'

/**
 * Critérios de aceite "via API" das user stories (RN-2, RN-3, RN-7):
 * autorização por papel e regra de disponibilidade, verificadas no contrato HTTP.
 */
test.describe('Autorização e regras via API (RN-2, RN-3, RN-7)', () => {

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

  // Todas as rotas atrás do `authenticate`, não uma amostra: as gêmeas de /me e as
  // três de /loans usam o mesmo middleware, e testar uma e não a outra é descuido —
  // uma rota que perdesse o middleware passaria despercebida.
  test('acesso sem token é rejeitado em toda rota protegida (401)', async ({ request }) => {
    const semToken: Array<[string, Promise<{ status: () => number }>]> = [
      ['GET /me/reservations', request.get(`${API}/me/reservations`)],
      ['GET /me/loans', request.get(`${API}/me/loans`)],
      ['GET /reservations', request.get(`${API}/reservations`)],
      ['POST /reservations', request.post(`${API}/reservations`, { data: { bookId: 'x' } })],
      ['GET /loans', request.get(`${API}/loans`)],
      ['POST /loans', request.post(`${API}/loans`, { data: { reservationId: 'x', dueAt: '2026-12-01T10:00:00Z' } })],
      ['PATCH /loans/:id/return', request.patch(`${API}/loans/qualquer/return`)],
      ['GET /me', request.get(`${API}/me`)],
    ]

    for (const [rota, pendente] of semToken) {
      expect((await pendente).status(), rota).toBe(401)
    }
  })

  test('token inválido é rejeitado (401)', async ({ request }) => {
    const res = await request.get(`${API}/me/reservations`, { headers: bearer('nao-e-um-jwt') })
    expect(res.status()).toBe(401)
  })

  // P-01 — o userId vem do `sub` do JWT, o que protege por construção. Este teste
  // trava a propriedade: aceitar um `?userId=` na rota abriria escalação horizontal
  // sem que nenhum outro teste reclamasse.
  test('Leitor só enxerga os próprios registros em /me/* (isolamento horizontal)', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)
    const bruno = await newActor(playwright, LEITOR_2.email)

    // Bruno reserva um Livro dedicado — é o registro que Ana não pode ver
    const metamorfose = await apiBookByTitle(bruno.ctx, 'A Metamorfose')
    const reservaDoBruno = await apiCreateReservation(bruno.ctx, bruno.token, metamorfose.id)

    const idsDe = async (actor: { ctx: typeof ana.ctx; token: string }, rota: string, query = '') => {
      const res = await actor.ctx.get(`${API}${rota}${query}`, { headers: bearer(actor.token) })
      expect(res.status(), `${rota}${query}`).toBe(200)
      return ((await res.json()).data as Array<{ id: string; user?: { id: string } }>)
    }

    const reservasDoBruno = await idsDe(bruno, '/me/reservations')
    expect(reservasDoBruno.map((r) => r.id)).toContain(reservaDoBruno.id)

    const reservasDaAna = await idsDe(ana, '/me/reservations')
    expect(reservasDaAna.map((r) => r.id)).not.toContain(reservaDoBruno.id)

    // Ana tem Empréstimo no seed; Bruno não tem nenhum — a lista dele não pode herdá-lo
    const emprestimosDaAna = await idsDe(ana, '/me/loans')
    expect(emprestimosDaAna.length).toBeGreaterThan(0)
    expect(await idsDe(bruno, '/me/loans')).toHaveLength(0)

    // Forjar o id do outro Leitor na query não muda nada: a fonte é o `sub` do token
    expect(await idsDe(bruno, '/me/loans', `?userId=${ana.user.id}`)).toHaveLength(0)
    const forjada = await idsDe(bruno, '/me/reservations', `?userId=${ana.user.id}`)
    expect(forjada.map((r) => r.id)).toEqual(reservasDoBruno.map((r) => r.id))

    await ana.dispose()
    await bruno.dispose()
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
