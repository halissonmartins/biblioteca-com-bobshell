import { expect, type APIRequestContext } from '@playwright/test'

/**
 * Helpers da suíte de API REST — o subconjunto de `e2e/helpers.ts` que não
 * depende de navegador: login por token, arrange de dados via API e atores
 * isolados. Nada de Mailpit nem tela do Keycloak: quem emite token aqui é o
 * Direct Access Grant do client de teste.
 */

/** Base da API (o webServer sobe em :3000). */
export const API = 'http://localhost:3000'

/**
 * Realm do Keycloak — quem emite os tokens (ADR-0009). Vem do docker compose.
 * Fase 2: https obrigatório (`sslRequired: all`) com a CA local de `make certs`.
 */
export const KEYCLOAK = process.env['KEYCLOAK_URL'] ?? 'https://localhost:8443'
export const REALM = 'biblioteca'
/**
 * Client DE TESTE com Direct Access Grant (Fase 2). O client `biblioteca-web`,
 * que a SPA usa, não aceita grant por senha — token só via tela + PKCE.
 */
export const KEYCLOAK_CLIENT_ID = 'biblioteca-e2e'
export const TOKEN_ENDPOINT = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`

/**
 * Senha dos usuários do seed. A política do realm (Fase 2) exige 12+ caracteres.
 */
export const SENHA_SEED = 'Biblioteca#2026!'

export const LEITOR = { email: 'leitor@biblioteca.dev', senha: SENHA_SEED }
/** Segundo Leitor do seed — sem Reserva nem Empréstimo (isolamento de /me/*) */
export const LEITOR_2 = { email: 'leitor2@biblioteca.dev', senha: SENHA_SEED }
export const BIBLIOTECARIO = { email: 'bibliotecario@biblioteca.dev', senha: SENHA_SEED }

// ---------------------------------------------------------------------------
// Leitores de cenário
// ---------------------------------------------------------------------------

/**
 * Uma conta de Leitor por cenário que **cria** Reserva.
 *
 * RN-9 e RN-10 fizeram da Reserva um recurso do Leitor, não só da Cópia: o mesmo
 * Leitor não tem duas Reservas ativas do mesmo Livro (Empréstimo em aberto do
 * título conta junto) e não passa de três ativas. Um Leitor compartilhado entre
 * cenários portanto acumula ao longo da suíte — o banco é o mesmo do começo ao
 * fim — e a partir de certo ponto os pedidos são recusados por acumulação, não
 * por defeito do sistema. Foi assim que as duas suítes ficaram vermelhas quando
 * as regras chegaram à API (issues #28, #29, #30).
 *
 * A tabela de alocação — qual Leitor é de qual cenário — fica no `AGENTS.md`
 * desta pasta, ao lado da dos Livros.
 *
 * O prefixo `e2e-` marca o espaço reservado às suítes: contas criadas à mão para
 * explorar o produto continuam livres para usar `leitorN@biblioteca.dev`, sem
 * colidir com o que os testes esperam encontrar.
 *
 * As contas vivem em `keycloak/realm-biblioteca.json` e **não** têm linha no
 * seed: o espelho local nasce no primeiro `GET /me` (JIT provisioning, ADR-0009).
 */
const leitorDeCenario = (slug: string) => ({
  email: `e2e-${slug}@biblioteca.dev`,
  senha: SENHA_SEED,
})

/** `contrato-api` RN-1 — reserva Dom Casmurro e continua com ela. */
export const LEITOR_RESERVA = leitorDeCenario('reserva')
/** `contrato-api` RN-8 — Memórias Póstumas vira Empréstimo em aberto. */
export const LEITOR_EMPRESTIMO = leitorDeCenario('emprestimo')
/** `contrato-api` RN-5 — A Hora da Estrela vai e volta (Devolução). */
export const LEITOR_DEVOLUCAO = leitorDeCenario('devolucao')
/** `contrato-api` RN-6 — Reserva de Memórias Póstumas que vence sem virar Empréstimo. */
export const LEITOR_VENCIDA = leitorDeCenario('vencida')
/** `regras-negocio-api` US-03 — dono da primeira Cópia de O Nome de Deus. */
export const LEITOR_ULTIMA_COPIA = leitorDeCenario('ultima-copia')
/**
 * `regras-negocio-api` US-03 — a fila pela última Cópia.
 *
 * Oito Leitores **distintos**, e é aí que está o ponto: com RN-9 um Leitor não
 * disputa consigo mesmo, então repetir contas faria sete perdedores receberem
 * `DUPLICATE_RESERVATION` e a disputa pela Cópia — o que o teste existe para
 * provar — ficaria sem cobertura nenhuma.
 */
export const FILA_ULTIMA_COPIA = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
  leitorDeCenario(`fila${String(n)}`),
)
/** `regras-negocio-api` RN-1/RN-5 — A Paixão Segundo G.H. expira ponta a ponta. */
export const LEITOR_EXPIRACAO = leitorDeCenario('expiracao')
/** `regras-negocio-api` RN-6 — A Paixão Segundo G.H. disputada no balcão. */
export const LEITOR_BALCAO_DUPLO = leitorDeCenario('balcao-duplo')
/** `regras-negocio-api` RN-9 — pede o mesmo Livro duas vezes no mesmo instante. */
export const LEITOR_DUPLICADA = leitorDeCenario('duplicada')
/** `regras-negocio-api` RN-10 — bate o teto de Reservas ativas de uma vez. */
export const LEITOR_TETO = leitorDeCenario('teto')
/** `contrato-api` RF-L8 — cancela a própria Reserva e a Cópia volta na hora. */
export const LEITOR_CANCELA = leitorDeCenario('cancela')
/** `regras-negocio-api` RN-11 — cancelar devolve a vaga de RN-10 e libera o Livro. */
export const LEITOR_CANCELA_TETO = leitorDeCenario('cancela-teto')
/** `regras-negocio-api` RF-L8 — cancelamento e balcão disputam a mesma Reserva. */
export const LEITOR_CANCELA_CORRIDA = leitorDeCenario('cancela-corrida')
/** `autorizacao-api` RN-11 — dono da Reserva que outro Leitor tenta cancelar. */
export const LEITOR_CANCELA_ALHEIA = leitorDeCenario('cancela-alheia')

// Os Leitores dos cenários de navegador (`bibliotecario`, `reservas-leitor`)
// vivem só em `e2e/helpers.ts` — esta suíte não os usa.

// ---------------------------------------------------------------------------
// Autenticação e arrange de dados
// ---------------------------------------------------------------------------

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export interface ApiUser {
  id: string
  name: string
  email: string
  role: 'leitor' | 'bibliotecario'
}

/**
 * Autentica direto no Keycloak e devolve o token junto do perfil LOCAL.
 *
 * São duas chamadas porque são duas coisas diferentes: o Keycloak diz quem a
 * pessoa é no realm, e `GET /me` diz qual é o `users.id` — o que as Reservas e
 * os Empréstimos referenciam, e o que os specs comparam. O `sub` do token é
 * outro identificador; não confunda os dois.
 */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  senha = SENHA_SEED,
): Promise<{ token: string; user: ApiUser }> {
  const res = await request.post(TOKEN_ENDPOINT, {
    form: {
      grant_type: 'password',
      client_id: KEYCLOAK_CLIENT_ID,
      username: email,
      password: senha,
    },
  })
  expect(res.status(), `login ${email} no Keycloak`).toBe(200)
  const token = (await res.json()).access_token as string

  const me = await request.get(`${API}/me`, { headers: bearer(token) })
  expect(me.status(), `GET /me de ${email}`).toBe(200)
  return { token, user: (await me.json()).data as ApiUser }
}

export interface CatalogBook {
  id: string
  title: string
  availableCopies: number
}

export async function apiListBooks(request: APIRequestContext): Promise<CatalogBook[]> {
  const res = await request.get(`${API}/books?pageSize=100`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data.data as CatalogBook[]
}

export async function apiBookByTitle(request: APIRequestContext, title: string): Promise<CatalogBook> {
  const book = (await apiListBooks(request)).find((b) => b.title === title)
  if (!book) throw new Error(`Livro não encontrado no catálogo: ${title}`)
  return book
}

export async function apiGetBook(request: APIRequestContext, id: string): Promise<CatalogBook> {
  const res = await request.get(`${API}/books/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data as CatalogBook
}

export interface ReservationDto {
  id: string
  expiresAt: string
  createdAt: string
  /**
   * Os três desfechos têm campo próprio desde RF-L8: `expiredAt` é do job
   * (RN-1) e `cancelledAt` é da desistência do Leitor (RN-11). Afirmar sobre o
   * campo certo é o que impede um teste de "cancelou" passar sobre uma expiração.
   */
  convertedAt: string | null
  expiredAt: string | null
  cancelledAt: string | null
  status: 'active' | 'expired' | 'converted' | 'cancelled'
  copy: { id: string; code: string; book: { id: string; title: string } }
  user: { id: string; name: string; email: string }
}

export async function apiCreateReservation(
  request: APIRequestContext,
  leitorToken: string,
  bookId: string,
): Promise<ReservationDto> {
  const res = await request.post(`${API}/reservations`, { headers: bearer(leitorToken), data: { bookId } })
  expect(res.status(), 'criar reserva').toBe(201)
  return (await res.json()).data.reservation as ReservationDto
}

export interface LoanDto {
  id: string
  dueAt: string
  returnedAt: string | null
  createdAt: string
  copy: { id: string; code: string; book: { id: string; title: string } }
  user: { id: string; name: string; email: string }
  librarian: { id: string; name: string }
}

export async function apiCreateLoan(
  request: APIRequestContext,
  bibliotecarioToken: string,
  reservationId: string,
  dueAtISO: string,
): Promise<LoanDto> {
  const res = await request.post(`${API}/loans`, {
    headers: bearer(bibliotecarioToken),
    data: { reservationId, dueAt: dueAtISO },
  })
  expect(res.status(), 'criar empréstimo').toBe(201)
  return (await res.json()).data.loan as LoanDto
}

/**
 * O Leitor cancela a própria Reserva (RF-L8, RN-11) — arrange de cenário.
 * Devolve a Reserva já encerrada, como a rota faz.
 */
export async function apiCancelReservation(
  request: APIRequestContext,
  leitorToken: string,
  reservationId: string,
): Promise<ReservationDto> {
  const res = await request.patch(`${API}/reservations/${reservationId}/cancel`, {
    headers: bearer(leitorToken),
  })
  expect(res.status(), 'cancelar reserva').toBe(200)
  return (await res.json()).data.reservation as ReservationDto
}

/** Data ISO 8601 N dias no futuro (para dueAt). */
export function inDaysISO(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Atores isolados
// ---------------------------------------------------------------------------

export interface Actor {
  ctx: APIRequestContext
  token: string
  user: ApiUser
  dispose: () => Promise<void>
}

/**
 * Cria um contexto HTTP próprio já autenticado.
 *
 * Cada ator carrega o próprio token. Compartilhar contexto entre dois atores
 * mistura sessões — e um teste de isolamento passaria por acidente. E para
 * concorrência vale a regra mais forte ainda: UM CONTEXTO POR REQUISIÇÃO,
 * porque um APIRequestContext reaproveita a conexão e enfileira as chamadas.
 */
export async function newActor(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  email: string,
  senha = SENHA_SEED,
): Promise<Actor> {
  const ctx = await playwright.request.newContext()
  const { token, user } = await apiLogin(ctx, email, senha)
  return { ctx, token, user, dispose: () => ctx.dispose() }
}

/**
 * Vários contextos HTTP para a MESMA pessoa — um por requisição, que é o que um
 * teste de concorrência exige (um `APIRequestContext` enfileira as chamadas).
 *
 * Criados em sequência de propósito: o primeiro `GET /me` de uma conta é o que
 * provisiona o espelho local dela (ADR-0009), e dois logins simultâneos de quem
 * ainda não tem linha em `users` disputariam o mesmo INSERT — 500 no lugar do
 * cenário. A concorrência que interessa é a das requisições de negócio, depois.
 */
export async function newActors(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  email: string,
  quantidade: number,
  senha = SENHA_SEED,
): Promise<Actor[]> {
  const atores: Actor[] = []
  for (let i = 0; i < quantidade; i++) {
    atores.push(await newActor(playwright, email, senha))
  }
  return atores
}

// ---------------------------------------------------------------------------
// Contrato de erro
// ---------------------------------------------------------------------------

/** Envelope de erro da API (errorHandler): `{ error: { code, message } }`. */
export interface ApiError {
  code: string
  message: string
}

export async function apiErrorOf(res: { json: () => Promise<unknown> }): Promise<ApiError> {
  const body = (await res.json()) as { error?: ApiError }
  if (!body.error) throw new Error(`Resposta sem envelope de erro: ${JSON.stringify(body)}`)
  return body.error
}
