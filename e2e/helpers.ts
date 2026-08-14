import { expect, type Page, type APIRequestContext } from '@playwright/test'

/** Base da API (o webServer sobe em :3000; a UI em :5173 faz proxy /api → :3000). */
export const API = 'http://localhost:3000'

export const LEITOR = { email: 'leitor@biblioteca.dev', senha: 'senha123' }
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

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

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
  copy: { book: { title: string } }
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
  copy: { book: { title: string } }
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
