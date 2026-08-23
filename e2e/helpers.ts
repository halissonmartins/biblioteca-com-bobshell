import { expect, type Page, type APIRequestContext } from '@playwright/test'

/** Base da API (o webServer sobe em :3000; a UI em :5173 faz proxy /api → :3000). */
export const API = 'http://localhost:3000'

/**
 * Realm do Keycloak — quem emite os tokens (ADR-0009). Vem do docker compose.
 * Fase 2: https obrigatório (`sslRequired: all`) com a CA local de `make certs`.
 */
export const KEYCLOAK = process.env['KEYCLOAK_URL'] ?? 'https://localhost:8443'
export const REALM = 'biblioteca'
/**
 * Client DE TESTE com Direct Access Grant (Fase 2). O client `biblioteca-web`,
 * que a SPA usa, não aceita mais grant por senha — token só via tela + PKCE.
 */
export const KEYCLOAK_CLIENT_ID = 'biblioteca-e2e'
export const TOKEN_ENDPOINT = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`

/** SMTP de desenvolvimento (Fase 2) — UI/API REST do Mailpit, onde o Keycloak entrega. */
export const MAILPIT = process.env['MAILPIT_URL'] ?? 'http://localhost:8025'

/**
 * Senha dos usuários do seed. A política do realm (Fase 2) exige 12+ caracteres;
 * `senha123`, da Fase 1, foi aposentada junto com o resto da postura frouxa.
 */
export const SENHA_SEED = 'Biblioteca#2026!'

export const LEITOR = { email: 'leitor@biblioteca.dev', senha: SENHA_SEED }
/** Segundo Leitor do seed — sem Reserva nem Empréstimo (isolamento de /me/*) */
export const LEITOR_2 = { email: 'leitor2@biblioteca.dev', senha: SENHA_SEED }
export const BIBLIOTECARIO = { email: 'bibliotecario@biblioteca.dev', senha: SENHA_SEED }

/** Regex que casa a origem do Keycloak — para waitForURL/toHaveURL. */
export const keycloakOrigem = (): RegExp =>
  new RegExp(KEYCLOAK.replace(/^https?:\/\//, ''))

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/**
 * Faz login pela interface e espera a sessão estar realmente estabelecida.
 *
 * O formulário não é nosso: `/login` encaminha para a tela do Keycloak, que
 * usa os ids `#username`, `#password` e `#kc-login`. A SPA força `ui_locales`,
 * então a tela vem em pt-BR independentemente do idioma do navegador.
 *
 * **Esperar o Catálogo não basta.** Ele é rota pública e aparece igual sem
 * sessão: quem esperasse só por ele voltaria enquanto o `GET /me` ainda estava
 * no ar, e o teste seguinte navegaria como visitante — foi assim que US-03
 * falhou pedindo um botão "Reservar" que a página só mostra a quem entrou. O
 * botão "Sair" só existe com sessão, e é esse o sinal.
 */
export async function loginUI(page: Page, email: string, senha = SENHA_SEED): Promise<void> {
  await page.goto('/login')
  await page.waitForURL(keycloakOrigem())
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(senha)
  await page.locator('#kc-login').click()
  await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
}

/**
 * Extrai da caixa do Mailpit o link de ação (`/login-actions/action-token`)
 * que o Keycloak enviou para `email` — verificação de cadastro ou reset de
 * senha. Os dois usam o mesmo caminho; o que distingue é o claim `typ` do JWT
 * dentro do parâmetro `key`. Visitar o link executa a ação.
 *
 * O envio não é instantâneo: consulta o Mailpit por até ~10 s antes de falhar.
 */
export async function linkDeAcaoDoEmail(
  request: APIRequestContext,
  email: string,
  tipo: 'verify-email' | 'reset-credentials',
): Promise<string> {
  const regexLink =
    /https:\/\/[^\s"<>]+\/realms\/biblioteca\/login-actions\/action-token\?[^\s"<>]+/

  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)
    if (res.ok()) {
      const { messages } = (await res.json()) as { messages: Array<{ ID: string }> }
      for (const { ID } of messages) {
        const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${ID}`)).json()) as {
          Text?: string
        }
        for (const link of (msg.Text ?? '').match(new RegExp(regexLink.source, 'g')) ?? []) {
          if (tipoDoActionToken(link) === tipo) return link
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Nenhum action token "${tipo}" chegou ao Mailpit para ${email} em ~10 s`)
}

/** Decodifica o claim `typ` do action token (JWT) embutido no parâmetro `key`. */
function tipoDoActionToken(link: string): string {
  const key = new URL(link).searchParams.get('key') ?? ''
  const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'))
  return typeof payload['typ'] === 'string' ? payload['typ'] : ''
}

/**
 * Auto-cadastro pela tela do Keycloak até a tela de DEFINIR SENHA (Fase 2).
 *
 * Com `verifyEmail: true`, o Keycloak não pede senha no cadastro: a conta nasce
 * só com e-mail e nome, e a senha é criada depois de confirmar o endereço — é o
 * que impede alguém de cadastrar e-mail alheio com senha própria. Este helper
 * preenche o formulário, busca o link de verificação no Mailpit (:8025) e o
 * abre NO MESMO navegador, caindo no formulário de nova senha.
 */
export async function registrarUI(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.waitForURL(keycloakOrigem())
  await page.locator('#kc-registration a, #kc-registration-container a').click()
  await page.locator('#firstName').fill('Pessoa')
  await page.locator('#lastName').fill('Recem-Cadastrada')
  await page.locator('#email').fill(email)
  await page.locator('input[type=submit]').click()

  const link = await linkDeAcaoDoEmail(page.request, email, 'verify-email')
  await page.goto(link)
  await page.locator('#password-new').waitFor()
}

/** Define a senha inicial na tela pós-verificação (ou troca senha via link de reset). */
export async function definirSenhaInicial(page: Page, senha = SENHA_SEED): Promise<void> {
  await page.locator('#password-new').fill(senha)
  await page.locator('#password-confirm').fill(senha)
  await page.locator('input[type=submit]').click()
}

/**
 * Cadastro completo: registra, confirma e-mail, define a senha e entra como
 * Leitor (papel padrão do realm). Devolve o e-mail usado.
 */
export async function registrarEEntrar(
  page: Page,
  email: string,
  senha = SENHA_SEED,
): Promise<string> {
  await registrarUI(page, email)
  await definirSenhaInicial(page, senha)

  // A execução do action token pode terminar com sessão já estabelecida (SSO)
  // ou de volta à tela de login — os dois caminhos terminam logados aqui.
  try {
    await page.getByRole('button', { name: 'Sair' }).waitFor({ timeout: 5_000 })
  } catch {
    await loginUI(page, email, senha)
  }
  return email
}

/** E-mail único, de domínio reservado que nunca resolve (RFC 2606). */
export function emailNovo(prefixo = 'novo'): string {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@dominio-inexistente.invalid`
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

/**
 * Autentica direto no Keycloak e devolve o token junto do perfil LOCAL.
 *
 * São duas chamadas porque são duas coisas diferentes: o Keycloak diz quem a
 * pessoa é no realm, e `GET /me` diz qual é o `users.id` — o que as Reservas e
 * os Empréstimos referenciam, e o que os specs comparam.
 *
 * Usa o Direct Access Grant do client `biblioteca-e2e` — o `biblioteca-web` não
 * aceita mais grant por senha desde a Fase 2 (docs/seguranca.md).
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
 * Cada ator carrega o próprio token e o próprio jogo de cookies de sessão do
 * Keycloak. Compartilhar contexto entre dois atores mistura as duas sessões no
 * mesmo jar — e um teste de isolamento passaria por acidente.
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
