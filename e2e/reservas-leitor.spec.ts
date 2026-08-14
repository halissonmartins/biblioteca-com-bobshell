import { test, expect } from '@playwright/test'
import { loginUI, LEITOR } from './helpers'

/** Extrai o número de cópias disponíveis do texto da tela de detalhes. */
function parseCount(texto: string): number {
  const m = texto.match(/(\d+)\s+cópias?\s+dispon/i)
  return m ? Number(m[1]) : 0
}

test.describe('Reservas do Leitor (US-03, US-04)', () => {
  test('US-03 — reserva Livro disponível, decrementa Disponibilidade e confirma expiração (RN-1, RN-3, RN-4)', async ({ page }) => {
    await loginUI(page, LEITOR.email)

    // Livro dedicado para não colidir com asserts de outros testes
    await page.goto('/')
    await page.getByPlaceholder('Título, autor ou ISBN').fill('O Processo')
    await page.getByRole('link', { name: 'Ver detalhes de O Processo' }).click()
    await expect(page.getByRole('heading', { name: 'O Processo' })).toBeVisible()

    const dispon = page.getByText(/cópias?\s+dispon[íi]/i)
    const antes = parseCount(await dispon.innerText())
    expect(antes).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Reservar' }).click()
    await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirmar reserva' }).click()

    // Confirmação com data/hora de expiração (12h — RN-1)
    await expect(page.getByText(/Retire o livro até/)).toBeVisible()
    // Disponibilidade decrementada imediatamente (RN-4)
    await expect(page.getByText(new RegExp(`${antes - 1}\\s+cópias?\\s+dispon`, 'i'))).toBeVisible()

    // Aparece em Minhas Reservas
    await page.getByRole('link', { name: 'Minhas Reservas' }).click()
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'O Processo' })).toBeVisible()
  })

  test('US-04 — Minhas Reservas lista reservas ativas com Livro e expiração (RF-L4)', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await page.getByRole('link', { name: 'Minhas Reservas' }).click()
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()

    // O seed cria uma reserva ativa de "Ensaio sobre a Cegueira" para o Leitor
    const linha = page.getByRole('row', { name: /Ensaio sobre a Cegueira/ })
    await expect(linha).toBeVisible()
    await expect(linha).toContainText(/\d{2}\/\d{2}\/\d{4}/) // data de expiração
  })
})
