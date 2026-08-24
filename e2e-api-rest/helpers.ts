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
