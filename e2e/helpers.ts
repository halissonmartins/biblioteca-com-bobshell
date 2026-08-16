import { expect, type Page, type APIRequestContext } from '@playwright/test'

/** Base da API (o webServer sobe em :3000; a UI em :5173 faz proxy /api → :3000). */
export const API = 'http://localhost:3000'

export const LEITOR = { email: 'leitor@biblioteca.dev', senha: 'senha123' }
/** Segundo Leitor do seed — sem Reserva nem Empréstimo (isolamento de /me/*) */
export const LEITOR_2 = { email: 'leitor2@biblioteca.dev', senha: 'senha123' }
export const BIBLIOTECARIO = { email: 'bibliotecario@biblioteca.dev', senha: 'senha123' }

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/** Faz login pela interface e espera cair no Catálogo. */
export async function loginUI(page: Page, email: string, senha = 'senha123'): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('seu@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(senha)
  await page.getByRole('main').getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/')
  await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
}

// ---------------------------------------------------------------------------
// API (arrange de dados e verificações de contrato/autorização)
// ---------------------------------------------------------------------------

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export interface ApiUser {
  id: string
  name: string
  email: string
  role: 'leitor' | 'bibliotecario'
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  senha = 'senha123',
): Promise<{ token: string; user: ApiUser }> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: senha } })
  expect(res.status(), `login ${email}`).toBe(200)
  const body = await res.json()
  return { token: body.data.accessToken as string, user: body.data.user as ApiUser }
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

/** Reserva um Livro pelo título (via API) — usado para preparar cenários. */
export async function apiReserveByTitle(
  request: APIRequestContext,
  leitorToken: string,
  title: string,
): Promise<ReservationDto> {
  const book = await apiBookByTitle(request, title)
  return apiCreateReservation(request, leitorToken, book.id)
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
 * A API dá precedência ao cookie `access_token` sobre o header Authorization, então
 * dois atores no mesmo contexto sobrescrevem a sessão um do outro — quem entra por
 * último responde por ambos, e um teste de isolamento passaria por acidente.
 */
export async function newActor(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  email: string,
  senha = 'senha123',
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
