import { test, expect } from '@playwright/test'
import { apiLogin, apiReserveByTitle, loginUI, LEITOR, LEITOR_2 } from './helpers'
import { expireAllReservationsOf, setReservationExpiry } from './db'

/** Extrai o número de cópias disponíveis do texto da tela de detalhes. */
function parseCount(texto: string): number {
  const m = texto.match(/(\d+)\s+cópias?\s+dispon/i)
  return m ? Number(m[1]) : 0
}

/** "11 h 49 min" / "49 min" → minutos. É o formato de balcão de formatDuration. */
function parseMinutos(texto: string): number {
  const m = texto.match(/(?:(\d+)\s*h\s*)?(\d+)\s*min/)
  if (!m) throw new Error(`Não é um tempo restante: "${texto}"`)
  return Number(m[1] ?? 0) * 60 + Number(m[2])
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
    await expect(linha.locator('strong')).toHaveText(/\d+\s*(h|min)/) // tempo restante
  })

  test('US-04 — o tempo restante avança sozinho, sem recarregar a página', async ({ page }) => {
    // Relógio controlado pelo teste: o intervalo real de useNow é de 30 s e a
    // granularidade exibida é o minuto — esperar de verdade custaria mais de um
    // minuto e ainda dependeria de onde o arredondamento caiu.
    await page.clock.install()

    await loginUI(page, LEITOR.email)
    await page.getByRole('link', { name: 'Minhas Reservas' }).click()
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()

    const restante = page.getByRole('row', { name: /Ensaio sobre a Cegueira/ }).locator('strong')
    const antes = parseMinutos(await restante.innerText())

    // Cinco minutos passam. Nenhum goto, nenhum reload, nenhum clique.
    await page.clock.fastForward(5 * 60 * 1_000)

    await expect
      .poll(async () => parseMinutos(await restante.innerText()))
      .toBe(antes - 5)
  })

  test('US-04 — Reserva que expira em menos de 1h é destacada com aviso de retirada urgente', async ({ page, request }) => {
    // O seed não cria Reserva nessa janela: sem preparar o dado, o destaque de
    // "Expira em breve" é código que nenhum teste jamais executa.
    const { token } = await apiLogin(request, LEITOR.email)
    const reserva = await apiReserveByTitle(request, token, 'A Hora da Estrela')
    await setReservationExpiry(reserva.id, 40 * 60 * 1_000)

    await loginUI(page, LEITOR.email)
    await page.getByRole('link', { name: 'Minhas Reservas' }).click()

    const linha = page.getByRole('row', { name: /A Hora da Estrela/ })
    await expect(linha).toContainText('Expira em breve')
    await expect(linha.locator('strong')).toHaveText(/^(39|40|41) min$/)

    // O aviso nomeia o Livro, o tempo restante e o que acontece se não retirar
    const aviso = page.getByRole('alert').filter({ hasText: 'Retirada urgente' })
    await expect(aviso).toContainText('A Hora da Estrela')
    await expect(aviso).toContainText(/\d+ min/)
    await expect(aviso).toContainText(/volta ao acervo/i)

    // As demais Reservas continuam sendo apenas "Ativa"
    await expect(page.getByRole('row', { name: /Ensaio sobre a Cegueira/ })).toContainText('Ativa')
  })

  test('US-04 — com todas as Reservas expiradas, a lista vazia explica o estado', async ({ page, request }) => {
    // O segundo Leitor do seed é usado justamente por não ter histórico: o que
    // sobra na tela é o estado vazio, não o resto do acervo de outra pessoa.
    const { user } = await apiLogin(request, LEITOR_2.email)
    await expireAllReservationsOf(user.id)

    await loginUI(page, LEITOR_2.email)
    await page.getByRole('link', { name: 'Minhas Reservas' }).click()
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()

    await expect(page.getByText('Você não tem reservas ativas.')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1) // a própria mensagem, nenhum registro
    // Sem Reserva viva não há retirada urgente a anunciar
    await expect(page.getByText('Retirada urgente')).toHaveCount(0)
  })
})
