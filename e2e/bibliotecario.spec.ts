import { test, expect } from '@playwright/test'
import {
  loginUI,
  apiLogin,
  apiReserveByTitle,
  apiCreateLoan,
  apiBookByTitle,
  inDaysISO,
  LEITOR,
  BIBLIOTECARIO,
} from './helpers'

test.describe('Painel do Bibliotecário (US-07 a US-11)', () => {
  test('US-07 — vê Reservas do sistema com Leitor e expiração (RF-B1)', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Reservas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Reservas' })).toBeVisible()

    const linha = page.getByRole('row', { name: /Ensaio sobre a Cegueira/ }).first()
    await expect(linha).toBeVisible()
    await expect(linha).toContainText('Ana Lima')
    await expect(linha).toContainText(LEITOR.email)
    await expect(linha).toContainText(/\d{2}\/\d{2}\/\d{4}/)
  })

  test('US-08 — lista Empréstimos ativos com Leitor, Livro e vencimento (RF-B2)', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Empréstimos', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Empréstimos' })).toBeVisible()

    const linha = page.getByRole('row', { name: /Ensaio sobre a Cegueira/ }).first()
    await expect(linha).toBeVisible()
    await expect(linha).toContainText('Ana Lima')
    await expect(linha).toContainText('Em curso')
  })

  test('US-09 — filtra Reservas por Leitor e limpa o filtro (RF-B3)', async ({ page, request }) => {
    const { user: leitor } = await apiLogin(request, LEITOR.email)
    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Reservas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Reservas' })).toBeVisible()

    const filtro = page.getByPlaceholder('ID do usuário ou e-mail')

    // Filtra pelo Leitor → vê seus registros
    await filtro.fill(leitor.id)
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.getByText(LEITOR.email).first()).toBeVisible()

    // Limpa o filtro → volta à lista completa
    await page.getByRole('button', { name: 'Limpar' }).click()
    await expect(page.getByText(LEITOR.email).first()).toBeVisible()

    // Filtro sem correspondência → lista vazia
    await filtro.fill('id-inexistente-000')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.getByText('Nenhuma reserva encontrada.')).toBeVisible()
  })

  test('US-10 — efetiva Empréstimo a partir de uma Reserva ativa (RF-B4, RN-6)', async ({ page, request }) => {
    // Arrange: Leitor reserva um Livro dedicado (via API)
    const { token: leitorToken } = await apiLogin(request, LEITOR.email)
    await apiReserveByTitle(request, leitorToken, 'Cem Anos de Solidão')

    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Empréstimos', exact: true }).click()
    await page.getByRole('button', { name: '+ Novo empréstimo' }).click()

    // Seleciona a reserva no modal e define o vencimento
    const opcao = page.locator('label', { hasText: 'Cem Anos de Solidão' })
    await expect(opcao).toBeVisible()
    await opcao.click()
    const vencimento = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await page.locator('input[type="date"]').fill(vencimento)
    await page.getByRole('button', { name: 'Confirmar empréstimo' }).click()

    // Reserva convertida em Empréstimo
    await expect(page.getByText('Empréstimo registrado com sucesso.')).toBeVisible()
    const linha = page.getByRole('row', { name: /Cem Anos de Solidão/ }).first()
    await expect(linha).toBeVisible()
    await expect(linha).toContainText('Em curso')
  })

  test('US-11 — registra Devolução e libera a Cópia (RF-B5, RN-5)', async ({ page, playwright }) => {
    // Contextos isolados: a API prioriza o cookie access_token, então cada ator
    // precisa do seu próprio contexto para não sobrescrever o token do outro.
    const leitorCtx = await playwright.request.newContext()
    const bibCtx = await playwright.request.newContext()

    // Arrange: cria Reserva (Leitor) + Empréstimo (Bibliotecário) de um Livro dedicado
    const antes = await apiBookByTitle(bibCtx, 'O Amor nos Tempos do Cólera')
    const { token: leitorToken } = await apiLogin(leitorCtx, LEITOR.email)
    const { token: bibToken } = await apiLogin(bibCtx, BIBLIOTECARIO.email)
    const reserva = await apiReserveByTitle(leitorCtx, leitorToken, 'O Amor nos Tempos do Cólera')
    await apiCreateLoan(bibCtx, bibToken, reserva.id, inDaysISO(7))

    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Empréstimos', exact: true }).click()

    const linha = page.getByRole('row', { name: /O Amor nos Tempos do Cólera/ }).first()
    await expect(linha).toBeVisible()
    await linha.getByRole('button', { name: 'Registrar devolução' }).click()

    await expect(page.getByRole('heading', { name: 'Confirmar devolução' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar devolução' }).click()

    // Empréstimo encerrado e Cópia liberada
    await expect(page.getByText('Devolução registrada com sucesso.')).toBeVisible()
    await expect(linha).toContainText('Devolvido')

    // Disponibilidade incrementada de volta ao valor original (RN-5)
    const depois = await apiBookByTitle(bibCtx, 'O Amor nos Tempos do Cólera')
    expect(depois.availableCopies).toBe(antes.availableCopies)

    await leitorCtx.dispose()
    await bibCtx.dispose()
  })
})
