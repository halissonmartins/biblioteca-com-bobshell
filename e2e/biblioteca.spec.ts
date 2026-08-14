import { test, expect, type Page } from '@playwright/test'

/**
 * Fluxo híbrido do PRD dirigido no navegador real:
 * Leitor reserva on-line → Bibliotecário acompanha presencialmente.
 * Cobre catálogo público, autenticação, RBAC e consistência entre atores.
 */

const LEITOR = { email: 'leitor@biblioteca.dev', senha: 'senha123' }
const BIBLIOTECARIO = { email: 'bibliotecario@biblioteca.dev', senha: 'senha123' }

/** Faz login pela UI e espera cair no Catálogo. */
async function loginUI(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('seu@email.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(senha)
  await page.getByRole('main').getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/')
  await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
}

test.describe('E2E Biblioteca — navegador real (Playwright)', () => {
  test('Catálogo público carrega e detalhe exige login para reservar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
    await expect(page.getByText(/\d+ livros? encontrados?/)).toBeVisible()
    const cards = page.locator('a[aria-label^="Ver detalhes de"]')
    expect(await cards.count()).toBeGreaterThan(0)

    await cards.first().click()
    await expect(page).toHaveURL(/\/livros\//)
    await expect(page.getByText(/Entre.*para reservar este livro/)).toBeVisible()
  })

  test('Leitor faz login, reserva um Livro disponível e vê em Minhas Reservas (RF-L3)', async ({ page }) => {
    await loginUI(page, LEITOR.email, LEITOR.senha)
    await expect(page.getByRole('link', { name: 'Minhas Reservas' })).toBeVisible()

    // Cards indisponíveis não contêm "cópia" (só "Indisponível")
    const disponivel = page.locator('a[aria-label^="Ver detalhes de"]').filter({ hasText: 'cópia' }).first()
    await expect(disponivel).toBeVisible()
    const titulo = (await disponivel.locator('h3').innerText()).trim()
    await disponivel.click()

    await expect(page).toHaveURL(/\/livros\//)
    const reservar = page.getByRole('button', { name: 'Reservar' })
    await expect(reservar).toBeEnabled()
    await reservar.click()

    await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    // Sucesso (RN-1: expira em 12h)
    await expect(page.getByText(/Retire o livro até/)).toBeVisible()

    await page.getByRole('link', { name: 'Minhas Reservas' }).click()
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
    await expect(page.getByRole('cell', { name: titulo })).toBeVisible()
  })

  test('RBAC — leitor é bloqueado em rota de bibliotecário (RN-7)', async ({ page }) => {
    await loginUI(page, LEITOR.email, LEITOR.senha)
    await expect(page.getByRole('link', { name: 'Empréstimos', exact: true })).toHaveCount(0)

    await page.goto('/bibliotecario/reservas')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
  })

  test('Bibliotecário faz login e vê as Reservas do sistema (RF-B1)', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email, BIBLIOTECARIO.senha)
    await expect(page.getByRole('link', { name: 'Reservas', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Empréstimos', exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Reservas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Reservas' })).toBeVisible()
    // Dado consistente entre atores: a Reserva do Leitor aparece para o Bibliotecário
    await expect(page.getByText(LEITOR.email).first()).toBeVisible()
  })
})
