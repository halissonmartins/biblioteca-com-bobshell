import { test, expect } from '@playwright/test'
import {
  loginUI,
  registrarUI,
  registrarEEntrar,
  definirSenhaInicial,
  emailNovo,
  apiLogin,
  keycloakOrigem,
  linkDeAcaoDoEmail,
  KEYCLOAK,
  LEITOR,
  BIBLIOTECARIO,
  SENHA_SEED,
} from './helpers'

test.describe('Autenticação e controle de acesso (RN-7)', () => {
  test('login do Leitor mostra navegação do Leitor', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await expect(page.getByRole('link', { name: 'Minhas Reservas' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Meus Empréstimos' })).toBeVisible()
    await expect(page.getByText('Ana Lima')).toBeVisible()
    // Leitor não vê rotas de Bibliotecário
    await expect(page.getByRole('link', { name: 'Reservas', exact: true })).toHaveCount(0)
  })

  test('login do Bibliotecário mostra navegação do Bibliotecário', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email)
    await expect(page.getByRole('link', { name: 'Reservas', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Empréstimos', exact: true })).toBeVisible()
    await expect(page.getByText('Carlos Mendes')).toBeVisible()
  })

  // A credencial é conferida pelo Keycloak, não por nós: o erro aparece na tela
  // dele, e não passa a ser problema nosso.
  test('credenciais inválidas exibem erro e permanecem no Keycloak', async ({ page }) => {
    await page.goto('/login')
    await page.waitForURL(keycloakOrigem())
    await page.locator('#username').fill(LEITOR.email)
    await page.locator('#password').fill('senha-errada')
    await page.locator('#kc-login').click()

    // `.kc-feedback-text` é a âncora do próprio Keycloak; as classes `pf-v5-*`
    // ao redor mudam com a versão do PatternFly do tema.
    await expect(page.locator('.kc-feedback-text')).toContainText(/inválid/i)
    await expect(page).toHaveURL(new RegExp(KEYCLOAK.replace(/^https?:\/\//, '')))
  })

  test('visitante não autenticado é redirecionado ao login em rota protegida', async ({ page }) => {
    await page.goto('/minhas-reservas')
    await expect(page).toHaveURL(new RegExp(KEYCLOAK.replace(/^https?:\/\//, '')))
  })

  // docs/design/fluxos.md: depois de autenticar, o Leitor retoma o que tentou
  // fazer. Sem isto todo login cairia no Catálogo.
  test('depois de autenticar, retoma a rota que tentou abrir', async ({ page }) => {
    await page.goto('/meus-emprestimos')
    await page.waitForURL(keycloakOrigem())
    await page.locator('#username').fill(LEITOR.email)
    await page.locator('#password').fill(SENHA_SEED)
    await page.locator('#kc-login').click()

    await expect(page).toHaveURL(/\/meus-emprestimos/)
    await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()
  })

  test('Leitor é bloqueado em rota de Bibliotecário (redireciona ao Catálogo)', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await page.goto('/bibliotecario/reservas')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
  })

  test('logout encerra a sessão e volta ao login', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await page.getByRole('button', { name: 'Sair' }).click()

    // O logout passa pelo end_session_endpoint do Keycloak: a sessão de SSO
    // morre junto. Sem isso o próximo acesso entraria sozinho e o botão "Sair"
    // seria decoração.
    await page.goto('/minhas-reservas')
    await expect(page).toHaveURL(new RegExp(KEYCLOAK.replace(/^https?:\/\//, '')))
    await expect(page.locator('#username')).toBeVisible()
  })
})

test.describe('Auto-cadastro (Fase 2: e-mail verificado, senha sob política)', () => {
  test('qualquer pessoa cria conta, define a senha após confirmar o e-mail e entra como Leitor', async ({ page, request }) => {
    // Fase 2: o cadastro não pede senha — a conta nasce só com e-mail confirmado
    // (o registrarUI visita o link do Mailpit) e a senha é definida na sequência.
    const email = emailNovo()
    await registrarEEntrar(page, email)

    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
    await expect(page.getByText('Pessoa Recem-Cadastrada')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Minhas Reservas' })).toBeVisible()

    // O papel é afirmado no JSON, não só pelo que a navegação deixa aparecer:
    // a tela esconde o link errado, mas quem decide 403 é a API. Este login
    // pelo Keycloak prova que a credencial ficou utilizável de verdade.
    const { user } = await apiLogin(request, email)
    expect(user).toMatchObject({ email, role: 'leitor' })
    // O espelho local nasceu no primeiro acesso — `id` é o nosso, não o do realm
    expect(user.id).toEqual(expect.any(String))
  })

  test('conta recém-criada não consegue agir como Bibliotecário (RN-7)', async ({ page }) => {
    await registrarEEntrar(page, emailNovo('sem-poder'))
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()

    await page.goto('/bibliotecario/emprestimos')
    await expect(page).toHaveURL(/\/$/)
  })

  test('senha abaixo da política do realm é recusada ao definir a credencial', async ({ page }) => {
    // Fase 2: passwordPolicy length(12)+notUsername. `senha123`, aceita na
    // Fase 1, agora morre na tela do próprio Keycloak — a API nem é vista.
    const email = emailNovo('fraca')
    await registrarUI(page, email)
    await definirSenhaInicial(page, 'senha123')

    await expect(page.getByText(/senha inválid[ao]:?/i)).toContainText(/12/)
  })

  test('recuperar senha: o link do e-mail redefine a credencial (Fase 2)', async ({ page, request }) => {
    const email = emailNovo('reset')
    await registrarEEntrar(page, email)
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page.locator('#username')).toBeVisible()

    // Fluxo "esqueci minha senha" da tela do Keycloak (resetPasswordAllowed).
    await page.locator('a[href*="reset-credentials"]').click()
    await page.locator('#username').fill(email)
    await page.locator('input[type=submit]').click()
    await expect(page.locator('.kc-feedback-text')).toContainText(/e-?mail/i)

    // O Mailpit recebe o e-mail de reset; visitar o link abre o formulário de nova senha.
    const link = await linkDeAcaoDoEmail(request, email, 'reset-credentials')
    await page.goto(link)
    const NOVA_SENHA = 'Reset#Biblioteca2026'
    await definirSenhaInicial(page, NOVA_SENHA)

    // A prova fica no token endpoint: a credencial nova vale; a antiga, não.
    const { user } = await apiLogin(request, email, NOVA_SENHA)
    expect(user.email).toBe(email)

    let antigaFalhou = false
    try {
      await apiLogin(request, email, SENHA_SEED)
    } catch {
      antigaFalhou = true
    }
    expect(antigaFalhou, 'a senha anterior deve deixar de valer').toBe(true)
  })
})
