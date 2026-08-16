import { test, expect } from '@playwright/test'
import {
  API,
  apiBookByTitle,
  apiCreateLoan,
  apiCreateReservation,
  apiErrorOf,
  apiGetBook,
  bearer,
  inDaysISO,
  newActor,
  BIBLIOTECARIO,
  LEITOR,
} from './helpers'
import { expireReservation, expireReservationAsJobWould } from './db'

/**
 * Contrato HTTP do caminho feliz e das rejeições de entrada.
 *
 * O resto da suíte observa o sucesso pela tela: o valor certo aparece formatado em
 * pt-BR dentro de uma célula. Isso prova que o produto funciona, não que a API
 * cumpre o contrato — 12h viram "16/08/2026 22:31" e um prazo trocado por 24h
 * continua passando. Aqui os números são conferidos antes de virar texto.
 */
test.describe('Contrato HTTP da API', () => {
  // -------------------------------------------------------------------------
  // Reservas
  // -------------------------------------------------------------------------

  test('RN-1 — POST /reservations devolve 201 com expiração exatamente 12h à frente', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)
    const livro = await apiBookByTitle(ana.ctx, 'Dom Casmurro')

    const antes = Date.now()
    const res = await ana.ctx.post(`${API}/reservations`, {
      headers: bearer(ana.token),
      data: { bookId: livro.id },
    })
    const depois = Date.now()

    expect(res.status()).toBe(201)
    const reserva = (await res.json()).data.reservation

    // Envelope e vínculos da Reserva criada (RN-4)
    expect(reserva).toMatchObject({
      id: expect.any(String),
      status: 'active',
      copy: { id: expect.any(String), code: expect.any(String), book: { id: livro.id, title: 'Dom Casmurro' } },
      user: { id: ana.user.id, email: LEITOR.email },
    })
    expect(reserva.convertedAt).toBeNull()
    expect(reserva.cancelledAt).toBeNull()

    // RN-1: 12h a partir da criação. A janela do próprio request é a única folga —
    // não há espaço para 11h nem para 13h.
    const DOZE_HORAS = 12 * 60 * 60 * 1_000
    const expiresAt = new Date(reserva.expiresAt).getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(antes + DOZE_HORAS)
    expect(expiresAt).toBeLessThanOrEqual(depois + DOZE_HORAS)

    await ana.dispose()
  })

  test('POST /reservations valida a entrada antes de tocar no acervo', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)

    // Corpo sem bookId — barrado pelo Zod
    const semBookId = await ana.ctx.post(`${API}/reservations`, { headers: bearer(ana.token), data: {} })
    expect(semBookId.status()).toBe(422)
    expect((await apiErrorOf(semBookId)).code).toBe('VALIDATION_ERROR')

    const vazio = await ana.ctx.post(`${API}/reservations`, {
      headers: bearer(ana.token),
      data: { bookId: '' },
    })
    expect(vazio.status()).toBe(422)
    expect((await apiErrorOf(vazio)).code).toBe('VALIDATION_ERROR')

    // Livro inexistente é 404: "esgotado" e "não existe" pedem coisas diferentes de
    // quem chamou — esperar a Cópia voltar ou corrigir o id.
    const inexistente = await ana.ctx.post(`${API}/reservations`, {
      headers: bearer(ana.token),
      data: { bookId: 'livro-que-nao-existe' },
    })
    expect(inexistente.status()).toBe(404)
    expect((await apiErrorOf(inexistente)).code).toBe('NOT_FOUND')

    // E o Livro que existe mas está sem Cópia livre continua sendo 409 (RN-3)
    const esgotado = await apiBookByTitle(ana.ctx, 'Ensaio sobre a Cegueira')
    expect(esgotado.availableCopies).toBe(0)
    const semCopia = await ana.ctx.post(`${API}/reservations`, {
      headers: bearer(ana.token),
      data: { bookId: esgotado.id },
    })
    expect(semCopia.status()).toBe(409)
    expect((await apiErrorOf(semCopia)).code).toBe('NO_COPY_AVAILABLE')

    await ana.dispose()
  })

  // -------------------------------------------------------------------------
  // Empréstimos
  // -------------------------------------------------------------------------

  test('RN-8 — POST /loans devolve 201 com o dueAt pedido e a Reserva convertida', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)

    const livro = await apiBookByTitle(ana.ctx, 'Memórias Póstumas de Brás Cubas')
    const reserva = await apiCreateReservation(ana.ctx, ana.token, livro.id)

    // 7 dias corridos (RN-8) — o padrão que o balcão aplica sem digitar nada
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString()
    const res = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { reservationId: reserva.id, dueAt },
    })

    expect(res.status()).toBe(201)
    const loan = (await res.json()).data.loan

    expect(loan).toMatchObject({
      id: expect.any(String),
      returnedAt: null,
      copy: { id: reserva.copy.id, book: { id: livro.id } },
      user: { id: ana.user.id, email: LEITOR.email },
      librarian: { id: carlos.user.id },
    })
    // O vencimento é o que foi pedido — sem arredondamento nem fuso pelo caminho
    expect(new Date(loan.dueAt).toISOString()).toBe(dueAt)

    await ana.dispose()
    await carlos.dispose()
  })

  test('POST /loans valida a entrada (reservationId e dueAt)', async ({ playwright }) => {
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)

    const semReserva = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { dueAt: new Date().toISOString() },
    })
    expect(semReserva.status()).toBe(422)
    expect((await apiErrorOf(semReserva)).code).toBe('VALIDATION_ERROR')

    const dataSolta = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { reservationId: 'qualquer', dueAt: '21/08/2026' },
    })
    expect(dataSolta.status()).toBe(422)
    expect((await apiErrorOf(dataSolta)).code).toBe('VALIDATION_ERROR')

    // Reserva inexistente é 404 — aqui o serviço tem o que procurar e não acha
    const inexistente = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { reservationId: 'reserva-que-nao-existe', dueAt: new Date().toISOString() },
    })
    expect(inexistente.status()).toBe(404)
    expect((await apiErrorOf(inexistente)).code).toBe('NOT_FOUND')

    await carlos.dispose()
  })

  test('RN-5 — PATCH /loans/:id/return devolve 200, encerra o Empréstimo e libera a Cópia', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)

    const livro = await apiBookByTitle(ana.ctx, 'A Hora da Estrela')
    const disponiveisAntes = livro.availableCopies
    const reserva = await apiCreateReservation(ana.ctx, ana.token, livro.id)
    const emprestimo = await apiCreateLoan(carlos.ctx, carlos.token, reserva.id, inDaysISO(7))

    const antes = Date.now()
    const res = await carlos.ctx.patch(`${API}/loans/${emprestimo.id}/return`, {
      headers: bearer(carlos.token),
    })
    const depois = Date.now()

    expect(res.status()).toBe(200)
    const devolvido = (await res.json()).data.loan
    expect(devolvido.id).toBe(emprestimo.id)
    expect(devolvido.returnedAt).not.toBeNull()

    const returnedAt = new Date(devolvido.returnedAt).getTime()
    expect(returnedAt).toBeGreaterThanOrEqual(antes)
    expect(returnedAt).toBeLessThanOrEqual(depois)

    // A Cópia voltou ao acervo — Disponibilidade de volta ao valor de partida
    expect((await apiGetBook(ana.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)

    // Devolver de novo é conflito, não um segundo registro
    const repetida = await carlos.ctx.patch(`${API}/loans/${emprestimo.id}/return`, {
      headers: bearer(carlos.token),
    })
    expect(repetida.status()).toBe(409)
    expect((await apiErrorOf(repetida)).code).toBe('CONFLICT')

    await ana.dispose()
    await carlos.dispose()
  })

  test('GET /reservations devolve a lista do Bibliotecário com o Leitor de cada registro', async ({ playwright }) => {
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)
    // Contexto próprio: a API prefere o cookie ao header, então logar a Ana aqui
    // dentro trocaria a sessão do Bibliotecário no meio do teste.
    const ana = await newActor(playwright, LEITOR.email)

    const reservas = await carlos.ctx.get(`${API}/reservations`, { headers: bearer(carlos.token) })
    expect(reservas.status()).toBe(200)
    const listaReservas = (await reservas.json()).data
    expect(Array.isArray(listaReservas)).toBe(true)
    expect(listaReservas.length).toBeGreaterThan(0)
    // Diferente de /me/reservations, aqui vem o Leitor e o status derivado (RF-B1)
    expect(listaReservas[0]).toMatchObject({
      id: expect.any(String),
      expiresAt: expect.any(String),
      status: expect.stringMatching(/^(active|expired|converted|cancelled)$/),
      copy: { code: expect.any(String), book: { title: expect.any(String) } },
      user: { id: expect.any(String), name: expect.any(String), email: expect.any(String) },
    })

    // Filtro por Leitor (RF-B3) — hoje é o id exato, ver "Melhorias futuras" no README
    const filtradas = await carlos.ctx.get(`${API}/reservations?userId=${ana.user.id}`, {
      headers: bearer(carlos.token),
    })
    expect(filtradas.status()).toBe(200)
    const daAna = (await filtradas.json()).data as Array<{ user: { id: string } }>
    expect(daAna.length).toBeGreaterThan(0)
    expect(daAna.every((r) => r.user.id === ana.user.id)).toBe(true)

    const semNinguem = await carlos.ctx.get(`${API}/reservations?userId=nao-existe`, {
      headers: bearer(carlos.token),
    })
    expect(semNinguem.status()).toBe(200)
    expect((await semNinguem.json()).data).toHaveLength(0)

    await ana.dispose()
    await carlos.dispose()
  })

  test('RN-6 — Reserva vencida não vira Empréstimo, e nenhum registro é criado', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)

    const livro = await apiBookByTitle(ana.ctx, 'Memórias Póstumas de Brás Cubas')
    const reserva = await apiCreateReservation(ana.ctx, ana.token, livro.id)
    await expireReservation(reserva.id)

    const res = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { reservationId: reserva.id, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
    })

    expect(res.status()).toBe(409)
    // Um código só, tenha o job de expiração passado por aqui ou não. Ele grava
    // `cancelledAt` para registrar a expiração (RN-1), e o serviço checa o prazo antes
    // do cancelamento justamente para que a resposta não dependa desse tempo — o
    // Bibliotecário lê "expirou" tanto no minuto seguinte quanto no dia seguinte.
    expect((await apiErrorOf(res)).code).toBe('RESERVATION_EXPIRED')

    // Mesma tentativa com a Reserva já processada pelo job — o caso comum, porque o
    // Bibliotecário raramente tenta no primeiro minuto após o vencimento
    await expireReservationAsJobWould(reserva.id)
    const depoisDoJob = await carlos.ctx.post(`${API}/loans`, {
      headers: bearer(carlos.token),
      data: { reservationId: reserva.id, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
    })
    expect(depoisDoJob.status()).toBe(409)
    expect((await apiErrorOf(depoisDoJob)).code).toBe('RESERVATION_EXPIRED')

    const loans = await carlos.ctx.get(`${API}/loans`, { headers: bearer(carlos.token) })
    expect(loans.status()).toBe(200)
    const daCopia = ((await loans.json()).data as Array<{ copy: { id: string } }>).filter(
      (l) => l.copy.id === reserva.copy.id,
    )
    expect(daCopia).toHaveLength(0)

    await ana.dispose()
    await carlos.dispose()
  })

  // -------------------------------------------------------------------------
  // Listas do Leitor — shape que a SPA consome
  // -------------------------------------------------------------------------

  test('GET /me/reservations e /me/loans respeitam o envelope e os campos do contrato', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)

    const reservas = await ana.ctx.get(`${API}/me/reservations`, { headers: bearer(ana.token) })
    expect(reservas.status()).toBe(200)
    const corpoReservas = await reservas.json()
    expect(Array.isArray(corpoReservas.data)).toBe(true)
    expect(corpoReservas.data.length).toBeGreaterThan(0)
    expect(corpoReservas.data[0]).toMatchObject({
      id: expect.any(String),
      expiresAt: expect.any(String),
      createdAt: expect.any(String),
      copy: {
        id: expect.any(String),
        code: expect.any(String),
        book: {
          id: expect.any(String),
          title: expect.any(String),
          author: { id: expect.any(String), name: expect.any(String) },
        },
      },
    })

    const emprestimos = await ana.ctx.get(`${API}/me/loans`, { headers: bearer(ana.token) })
    expect(emprestimos.status()).toBe(200)
    const corpoEmprestimos = await emprestimos.json()
    expect(Array.isArray(corpoEmprestimos.data)).toBe(true)
    expect(corpoEmprestimos.data.length).toBeGreaterThan(0)
    expect(corpoEmprestimos.data[0]).toMatchObject({
      id: expect.any(String),
      dueAt: expect.any(String),
      createdAt: expect.any(String),
      copy: { id: expect.any(String), book: { title: expect.any(String) } },
      user: { id: ana.user.id, name: expect.any(String), email: LEITOR.email },
      librarian: { id: expect.any(String), name: expect.any(String) },
    })

    // Datas são ISO 8601 — a tela formata, o contrato não
    for (const item of [...corpoReservas.data, ...corpoEmprestimos.data]) {
      const iso = (item as { expiresAt?: string; dueAt?: string }).expiresAt ?? (item as { dueAt: string }).dueAt
      expect(new Date(iso).toISOString()).toBe(iso)
    }

    await ana.dispose()
  })

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------

  test('GET /books pagina de verdade: limite, página seguinte e total coerentes', async ({ request }) => {
    const p1 = await request.get(`${API}/books?page=1&pageSize=3`)
    expect(p1.status()).toBe(200)
    const pagina1 = (await p1.json()).data

    expect(pagina1.data).toHaveLength(3)
    expect(pagina1.pagination).toMatchObject({ page: 1, pageSize: 3 })
    expect(pagina1.pagination.total).toBeGreaterThan(3)
    expect(pagina1.pagination.totalPages).toBe(Math.ceil(pagina1.pagination.total / 3))

    const p2 = await request.get(`${API}/books?page=2&pageSize=3`)
    const pagina2 = (await p2.json()).data
    expect(pagina2.pagination.page).toBe(2)

    // Página seguinte traz outros Livros — não a mesma janela de novo
    const ids1 = (pagina1.data as Array<{ id: string }>).map((b) => b.id)
    const ids2 = (pagina2.data as Array<{ id: string }>).map((b) => b.id)
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0)

    // Página além do fim: lista vazia, e o total continua sendo o do acervo
    const ultima = await request.get(`${API}/books?page=999&pageSize=3`)
    const vazia = (await ultima.json()).data
    expect(vazia.data).toHaveLength(0)
    expect(vazia.pagination.total).toBe(pagina1.pagination.total)

    // pageSize acima do teto é entrada inválida, não um teto silencioso
    const exagerado = await request.get(`${API}/books?pageSize=101`)
    expect(exagerado.status()).toBe(422)
    expect((await apiErrorOf(exagerado)).code).toBe('VALIDATION_ERROR')
  })

  test('GET /books/:id inexistente é 404', async ({ request }) => {
    const res = await request.get(`${API}/books/nao-existe`)
    expect(res.status()).toBe(404)
    expect((await apiErrorOf(res)).code).toBe('NOT_FOUND')
  })

  test('GET /authors/:slug devolve o Autor com seus Livros (RF-L6)', async ({ request }) => {
    const res = await request.get(`${API}/authors/jose-saramago`)
    expect(res.status()).toBe(200)

    const autor = (await res.json()).data
    expect(autor).toMatchObject({ name: 'José Saramago', slug: 'jose-saramago' })
    expect(autor.books).toHaveLength(2)
    expect((autor.books as Array<{ title: string }>).map((b) => b.title).sort()).toEqual(
      ['Ensaio sobre a Cegueira', 'O Nome de Deus'],
    )
    // Disponibilidade vem junto: é o que a página do Autor mostra em cada Livro
    for (const livro of autor.books as Array<{ availableCopies: number }>) {
      expect(typeof livro.availableCopies).toBe('number')
    }

    const inexistente = await request.get(`${API}/authors/autor-que-nao-existe`)
    expect(inexistente.status()).toBe(404)
    expect((await apiErrorOf(inexistente)).code).toBe('NOT_FOUND')
  })

  // -------------------------------------------------------------------------
  // Sessão
  // -------------------------------------------------------------------------

  test('POST /auth/refresh rotaciona o token e invalida o anterior (ADR-0003)', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)

    const cookieAntigo = (await ana.ctx.storageState()).cookies.find((c) => c.name === 'refresh_token')
    expect(cookieAntigo, 'login deve emitir cookie refresh_token').toBeDefined()

    // O cookie viaja sozinho no mesmo contexto
    const res = await ana.ctx.post(`${API}/auth/refresh`)
    expect(res.status()).toBe(200)
    const novoAccessToken = (await res.json()).data.accessToken as string
    expect(novoAccessToken).toEqual(expect.any(String))

    // O access token novo vale de verdade — não é só uma string bem formada
    const comNovo = await ana.ctx.get(`${API}/me/reservations`, { headers: bearer(novoAccessToken) })
    expect(comNovo.status()).toBe(200)

    // O refresh token anterior morreu na rotação. Num contexto limpo, sem cookie,
    // ele é enviado no corpo — que é o outro caminho aceito pela rota.
    const semSessao = await playwright.request.newContext()
    const reuso = await semSessao.post(`${API}/auth/refresh`, {
      data: { refreshToken: cookieAntigo!.value },
    })
    expect(reuso.status()).toBe(401)

    const semToken = await semSessao.post(`${API}/auth/refresh`, { data: {} })
    expect(semToken.status()).toBe(401)

    await semSessao.dispose()
    await ana.dispose()
  })

  test('POST /auth/logout devolve 204 e encerra a renovação da sessão', async ({ playwright }) => {
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)
    const refreshToken = (await carlos.ctx.storageState()).cookies.find(
      (c) => c.name === 'refresh_token',
    )!.value

    const res = await carlos.ctx.post(`${API}/auth/logout`, { headers: bearer(carlos.token) })
    expect(res.status()).toBe(204)
    expect(await res.text()).toBe('')

    // Os cookies saíram do navegador…
    expect((await carlos.ctx.storageState()).cookies.map((c) => c.name)).not.toContain('refresh_token')

    // …e o refresh token foi revogado no servidor: reapresentá-lo por fora do cookie
    // não ressuscita a sessão. O access token, esse, vale até vencer — é JWT, não
    // sessão de servidor; o que o logout encerra é a renovação (ADR-0003).
    const semSessao = await playwright.request.newContext()
    const reuso = await semSessao.post(`${API}/auth/refresh`, { data: { refreshToken } })
    expect(reuso.status()).toBe(401)

    await semSessao.dispose()
    await carlos.dispose()
  })

  test('POST /auth/login rejeita credenciais inválidas com 401', async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: LEITOR.email, password: 'senha-errada' },
    })
    expect(res.status()).toBe(401)
    expect((await apiErrorOf(res)).code).toBe('INVALID_CREDENTIALS')

    const semArroba = await request.post(`${API}/auth/login`, {
      data: { email: 'sem-arroba', password: 'senha123' },
    })
    expect(semArroba.status()).toBe(422)
    expect((await apiErrorOf(semArroba)).code).toBe('VALIDATION_ERROR')
  })
})
