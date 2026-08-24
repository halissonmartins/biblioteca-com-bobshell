import { test, expect } from '@playwright/test'
import {
  API,
  apiErrorOf,
  bearer,
  newActor,
  BIBLIOTECARIO,
  LEITOR,
} from './helpers'

/**
 * Extensões do contrato HTTP que faltavam na suíte irmã (`e2e/`) e aqui têm
 * casa: rotas públicas de infraestrutura, filtros do catálogo e da lista de
 * Empréstimos, perfil do Bibliotecário e o envelope de erro para pedidos que
 * nem chegam a tocar uma rota (caminho desconhecido, corpo malformado).
 *
 * Nenhum cenário consome Cópia em caráter permanente: o filtro de Empréstimos
 * lê o estado do seed, sem criar Reserva.
 */
test.describe('Extensões do contrato HTTP da API', () => {
  // -------------------------------------------------------------------------
  // Infraestrutura
  // -------------------------------------------------------------------------

  test('GET /health é público e confirma o banco (liveness)', async ({ request }) => {
    // Sem Authorization: se /health exigisse token, nenhum orquestrador ou
    // balanceador conseguiria sondar o serviço.
    const res = await request.get(`${API}/health`)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' })
  })

  // -------------------------------------------------------------------------
  // Catálogo — busca e gênero (US-01), hoje só exercitados pela tela
  // -------------------------------------------------------------------------

  test('GET /books?search= casa título OU nome do autor (US-01)', async ({ request }) => {
    // Pelo nome do Autor: os dois Livros de Saramago vêm, e o nome dele junto
    const porAutor = await request.get(`${API}/books?search=Saramago`)
    expect(porAutor.status()).toBe(200)
    const achadosAutor = (await porAutor.json()).data
    expect(achadosAutor.pagination.total).toBe(2)
    expect(
      (achadosAutor.data as Array<{ title: string }>).map((b) => b.title).sort(),
    ).toEqual(['Ensaio sobre a Cegueira', 'O Nome de Deus'])
    for (const livro of achadosAutor.data as Array<{ author: { name: string } }>) {
      expect(livro.author.name).toContain('Saramago')
    }

    // Pelo título: um só Livro, mesmo tendo autor diferente de todos os outros
    const porTitulo = await request.get(`${API}/books?search=Cegueira`)
    const achadosTitulo = (await porTitulo.json()).data
    expect((achadosTitulo.data as Array<{ title: string }>).map((b) => b.title)).toEqual([
      'Ensaio sobre a Cegueira',
    ])

    // Termo que não casa com nada: lista vazia com o total coerente — não é
    // erro, é busca sem resultado (o atributo busca_vazia da métrica nasce aqui)
    const nada = await request.get(`${API}/books?search=obra-fora-do-acervo`)
    expect(nada.status()).toBe(200)
    const vazio = (await nada.json()).data
    expect(vazio.data).toHaveLength(0)
    expect(vazio.pagination.total).toBe(0)
  })

  test('GET /books?genre= filtra pelo gênero exato e estreita a listagem', async ({ request }) => {
    const tudo = await request.get(`${API}/books?pageSize=100`)
    const acervo = (await tudo.json()).data
    expect(acervo.pagination.total).toBeGreaterThan(2)

    const resposta = await request.get(`${API}/books?genre=${encodeURIComponent('Realismo mágico')}`)
    expect(resposta.status()).toBe(200)
    const pagina = (await resposta.json()).data

    // Todo item vem do gênero pedido — o filtro é exato, não substring
    for (const livro of pagina.data as Array<{ genre: string }>) {
      expect(livro.genre).toBe('Realismo mágico')
    }
    // Os dois García Márquez do seed estão entre eles
    const titulos = (pagina.data as Array<{ title: string }>).map((b) => b.title)
    expect(titulos).toContain('Cem Anos de Solidão')
    expect(titulos).toContain('O Amor nos Tempos do Cólera')

    // E o filtro realmente estreita: o acervo inteiro tem mais Livros que a página
    expect(pagina.pagination.total).toBeLessThan(acervo.pagination.total)
  })

  // -------------------------------------------------------------------------
  // Balcão — filtro de Empréstimos por Leitor (RF-B3), lado HTTP de US-09
  // -------------------------------------------------------------------------

  test('GET /loans?userId= devolve apenas os Empréstimos do Leitor pedido', async ({ playwright }) => {
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)
    // Contexto próprio: a Ana entra com o id dela na query, não com a sessão dela
    const ana = await newActor(playwright, LEITOR.email)

    // O seed dá à Ana um Empréstimo ativo — a lista completa nunca nasce vazia
    const todas = await carlos.ctx.get(`${API}/loans`, { headers: bearer(carlos.token) })
    expect(todas.status()).toBe(200)
    const lista = (await todas.json()).data
    expect(Array.isArray(lista)).toBe(true)
    expect(lista.length).toBeGreaterThan(0)

    // Filtrado por Leitor: cada registro pertence ao Leitor da query (RF-B3)
    const daAna = await carlos.ctx.get(`${API}/loans?userId=${ana.user.id}`, {
      headers: bearer(carlos.token),
    })
    expect(daAna.status()).toBe(200)
    const filtrada = (await daAna.json()).data as Array<{ user: { id: string } }>
    expect(filtrada.length).toBeGreaterThan(0)
    expect(filtrada.every((l) => l.user.id === ana.user.id)).toBe(true)

    // Leitor sem vínculo nenhum: lista vazia, não erro — espelha o contrato do
    // filtro de Reservas (?userId= inexistente → 200 [])
    const ninguem = await carlos.ctx.get(`${API}/loans?userId=leitor-que-nao-existe`, {
      headers: bearer(carlos.token),
    })
    expect(ninguem.status()).toBe(200)
    expect((await ninguem.json()).data).toHaveLength(0)

    await ana.dispose()
    await carlos.dispose()
  })

  // -------------------------------------------------------------------------
  // Identidade — o papel de balcão também aparece em /me
  // -------------------------------------------------------------------------

  test('GET /me devolve o papel bibliotecario para quem opera o balcão', async ({ playwright }) => {
    const carlos = await newActor(playwright, BIBLIOTECARIO.email)

    const res = await carlos.ctx.get(`${API}/me`, { headers: bearer(carlos.token) })
    expect(res.status()).toBe(200)

    const perfil = (await res.json()).data
    expect(perfil).toMatchObject({
      name: 'Carlos Mendes',
      email: BIBLIOTECARIO.email,
      role: 'bibliotecario',
    })
    // Mesmo contrato de privacidade do perfil do Leitor: espelho interno não sai
    expect(perfil).not.toHaveProperty('externalId')

    await carlos.dispose()
  })

  // -------------------------------------------------------------------------
  // Envelope de erro fora das rotas — o que o cliente vê quando o pedido nem
  // chega a um handler (rota desconhecida, método sem suporte, JSON quebrado)
  // -------------------------------------------------------------------------

  test('caminho e método sem handler respondem 404 no envelope JSON da casa', async ({ request }) => {
    // Antes deste contrato existir, cair aqui devolvia o HTML default do
    // Express ("Cannot GET …") — inútil para quem consome o envelope de erro.
    const caminho = await request.get(`${API}/rota-que-nao-existe`)
    expect(caminho.status()).toBe(404)
    expect(await apiErrorOf(caminho)).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('/rota-que-nao-existe'),
    })

    // Verbo que nenhuma rota atende para um recurso que existe
    const metodo = await request.delete(`${API}/books/${'nao-importa-o-id'}`)
    expect(metodo.status()).toBe(404)
    expect((await apiErrorOf(metodo)).code).toBe('NOT_FOUND')
  })

  test('corpo JSON malformado é entrada inválida (422), não erro interno', async ({ request }) => {
    // Content-Type application/json com corpo truncado: o parser do Express
    // rejeita ANTES de qualquer roda/validação. Sem tratamento, isso virava
    // 500 INTERNAL_ERROR — e, fora de produção, vazava a mensagem do parse.
    const res = await request.post(`${API}/reservations`, {
      headers: { 'content-type': 'application/json' },
      data: '{"bookId": ',
    })
    expect(res.status()).toBe(422)

    // A mensagem distingue a rejeição do parser das rejeções do Zod
    // ("reservationId obrigatório" etc.) — mesma família, origem diferente.
    const erro = await apiErrorOf(res)
    expect(erro.code).toBe('VALIDATION_ERROR')
    expect(erro.message).toContain('JSON')
  })
})
