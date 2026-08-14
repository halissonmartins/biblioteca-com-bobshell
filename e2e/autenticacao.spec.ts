import { test, expect } from '@playwright/test'
import { loginUI, LEITOR, BIBLIOTECARIO } from './helpers'

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

  test('credenciais inválidas exibem erro e permanecem no login', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill(LEITOR.email)
    await page.getByPlaceholder('••••••••').fill('senha-errada')
    await page.getByRole('main').getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('alert')).toContainText(/E-mail ou senha incorretos/i)
    await expect(page).toHaveURL(/\/login/)
  })

  test('e-mail em formato inválido é barrado no cliente', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill('sem-arroba')
    await page.getByPlaceholder('••••••••').fill('senha123')
    await page.getByRole('main').getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('visitante não autenticado é redirecionado ao login em rota protegida', async ({ page }) => {
    await page.goto('/minhas-reservas')
    await expect(page).toHaveURL(/\/login/)
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
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })
})
