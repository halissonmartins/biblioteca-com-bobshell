import { test, expect } from '@playwright/test'
import { loginUI, LEITOR } from './helpers'

test.describe('Empréstimos do Leitor (US-05)', () => {
  test('US-05 — Meus Empréstimos lista Livros emprestados com vencimento e status (RF-L5)', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await page.getByRole('link', { name: 'Meus Empréstimos' }).click()
    await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()

    // O seed cria um empréstimo ativo de "Ensaio sobre a Cegueira" para o Leitor
    const linha = page.getByRole('row', { name: /Ensaio sobre a Cegueira/ })
    await expect(linha).toBeVisible()
    await expect(linha).toContainText(/\d{2}\/\d{2}\/\d{4}/) // vencimento
    await expect(linha).toContainText('Em curso')
  })
})
