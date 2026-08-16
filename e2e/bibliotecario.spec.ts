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
import { expireReservation } from './db'

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

    // A lista abre em "Ativas"; o filtro por Leitor é exercido sobre a lista completa
    await page.getByRole('button', { name: /^Todas/ }).click()

    const filtro = page.getByPlaceholder('ID do usuário')

    // Filtra pelo Leitor → vê seus registros
    await filtro.fill(leitor.id)
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.getByText(LEITOR.email).first()).toBeVisible()

    // Limpa o filtro → volta à lista completa
    await page.getByRole('button', { name: 'Limpar' }).click()
    await expect(page.getByText(LEITOR.email).first()).toBeVisible()

    // Filtro sem correspondência → lista vazia, e a mensagem fala do filtro,
    // não do acervo: dizer "não há livro separado" seria falso aqui
    await filtro.fill('id-inexistente-000')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page.getByText('Nenhuma reserva para o leitor id-inexistente-000.')).toBeVisible()
  })

  test('US-10 — efetiva Empréstimo a partir da linha da Reserva (RF-B4, RN-6)', async ({ page, request }) => {
    // Arrange: Leitor reserva um Livro dedicado (via API)
    const { token: leitorToken } = await apiLogin(request, LEITOR.email)
    await apiReserveByTitle(request, leitorToken, 'Cem Anos de Solidão')

    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Reservas', exact: true }).click()

    // Ler linha → clicar: a Reserva já está escolhida, sem etapa de seleção
    const reserva = page.getByRole('row', { name: /Cem Anos de Solidão/ }).first()
    await expect(reserva).toBeVisible()
    await reserva.getByRole('button', { name: 'Efetivar empréstimo' }).click()

    // O modal abre vinculado à Reserva, com o vencimento já preenchido (hoje + 7 dias)
    await expect(page.getByRole('heading', { name: 'Efetivar empréstimo' })).toBeVisible()
    const padrao = new Date()
    padrao.setDate(padrao.getDate() + 7)
    const esperado = [
      padrao.getFullYear(),
      String(padrao.getMonth() + 1).padStart(2, '0'),
      String(padrao.getDate()).padStart(2, '0'),
    ].join('-')
    await expect(page.locator('input[type="date"]')).toHaveValue(esperado)

    // Confirmar: nenhuma digitação foi necessária
    await page.getByRole('button', { name: 'Confirmar empréstimo' }).click()
    await expect(page.getByText(/Empréstimo registrado\. Devolução até \d{2}\/\d{2}\/\d{4}\./)).toBeVisible()

    // A Reserva virou Empréstimo em curso
    await page.getByRole('link', { name: 'Empréstimos', exact: true }).click()
    const emprestimo = page.getByRole('row', { name: /Cem Anos de Solidão/ }).first()
    await expect(emprestimo).toBeVisible()
    await expect(emprestimo).toContainText('Em curso')
  })

  test('US-10 — Reserva que vence com o modal aberto falha sem perder a seleção (RN-6)', async ({ page, request }) => {
    // O Leitor está no balcão: a Reserva era válida quando o Bibliotecário abriu o
    // modal e venceu antes de ele confirmar. É o caminho de erro de RF-B4 — e o
    // critério diz que a Reserva escolhida não pode sumir junto com o erro.
    const { token: leitorToken } = await apiLogin(request, LEITOR.email)
    const reserva = await apiReserveByTitle(request, leitorToken, 'A Metamorfose')

    await loginUI(page, BIBLIOTECARIO.email)
    await page.getByRole('link', { name: 'Reservas', exact: true }).click()

    const linha = page
      .getByRole('row')
      .filter({ hasText: 'A Metamorfose' })
      .filter({ hasText: LEITOR.email })
    await expect(linha).toBeVisible()
    await linha.getByRole('button', { name: 'Efetivar empréstimo' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal.getByRole('heading', { name: 'Efetivar empréstimo' })).toBeVisible()
    await expect(modal).toContainText('A Metamorfose')

    // O prazo estoura entre a abertura do modal e a confirmação
    await expireReservation(reserva.id)
    await modal.getByRole('button', { name: 'Confirmar empréstimo' }).click()

    // A mensagem de balcão de US-10, dentro do modal: diz o que houve com a Cópia
    // física e qual é o próximo passo
    await expect(modal.getByRole('alert')).toContainText(
      'A Reserva expirou e a Cópia voltou ao acervo. Peça ao Leitor para reservar novamente.',
    )

    // A Reserva selecionada continua ali: nada de reencontrar a linha com o Leitor
    // esperando na frente
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('A Metamorfose')
    await expect(modal).toContainText(LEITOR.email)
    await expect(modal.locator('input[type="date"]')).toHaveValue(/\d{4}-\d{2}-\d{2}/)

    // E nenhum Empréstimo foi criado
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('link', { name: 'Empréstimos', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Empréstimos' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'A Metamorfose' })).toHaveCount(0)
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
