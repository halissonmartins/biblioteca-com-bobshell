import { test, expect } from '@playwright/test'
import { loginUI, LEITOR } from './helpers'

test.describe('Catálogo, detalhes e autor (US-01, US-02, US-06)', () => {
  test('US-01 — catálogo lista Livros paginados com título, autor e disponibilidade', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
    await expect(page.getByText(/\d+ livros? encontrados?/)).toBeVisible()

    const cards = page.locator('a[aria-label^="Ver detalhes de"]')
    expect(await cards.count()).toBeGreaterThan(0)

    const first = cards.first()
    await expect(first.locator('h3')).toBeVisible()                 // título
    await expect(first).toContainText(/dispon[íi]|Indisponível/i)   // disponibilidade
  })

  test('US-01 — busca filtra por título e por autor', async ({ page }) => {
    await page.goto('/')
    const busca = page.getByPlaceholder('Título, autor ou ISBN')

    await busca.fill('Casmurro')
    await expect(page.getByRole('link', { name: 'Ver detalhes de Dom Casmurro' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver detalhes de A Metamorfose' })).toHaveCount(0)

    await busca.fill('Saramago') // busca por nome do autor
    await expect(page.getByRole('link', { name: 'Ver detalhes de Ensaio sobre a Cegueira' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver detalhes de Dom Casmurro' })).toHaveCount(0)
  })

  test('US-02 — detalhes do Livro exibem sinopse, gênero, disponibilidade e avaliações', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Ver detalhes de A Hora da Estrela' }).click()

    await expect(page).toHaveURL(/\/livros\//)
    await expect(page.getByRole('heading', { name: 'A Hora da Estrela' })).toBeVisible()
    await expect(page.getByText('Clarice Lispector').first()).toBeVisible()   // autor
    await expect(page.getByText('Ficção brasileira').first()).toBeVisible()   // gênero
    await expect(page.getByRole('heading', { name: 'Sinopse' })).toBeVisible()
    await expect(page.getByText(/cópias? dispon[íi]/i)).toBeVisible()         // nº de cópias
    await expect(page.getByRole('heading', { name: 'Avaliações' })).toBeVisible()
  })

  test('US-02 — Livro sem Disponibilidade desabilita "Reservar" (RN-3)', async ({ page }) => {
    // "Ensaio sobre a Cegueira" tem 0 cópias disponíveis no seed (1 reservada + 1 emprestada)
    await loginUI(page, LEITOR.email)
    await page.goto('/')
    await page.getByRole('link', { name: 'Ver detalhes de Ensaio sobre a Cegueira' }).click()

    const btn = page.getByRole('button', { name: 'Indisponível' })
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
    await expect(page.getByText(/Sem cópias disponíveis|Nenhuma cópia disponível/i).first()).toBeVisible()
  })

  test('US-06 — página do Autor lista seus Livros com Disponibilidade (RF-L6)', async ({ page }) => {
    await page.goto('/autores/jose-saramago')
    await expect(page.getByRole('heading', { name: 'José Saramago' })).toBeVisible()
    await expect(page.getByText(/Livros publicados \(2\)/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Ensaio sobre a Cegueira/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /O Nome de Deus/ })).toBeVisible()
  })
})
