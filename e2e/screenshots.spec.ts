/**
 * Captura as telas do produto para assets/images/, que alimentam o README.
 *
 * NÃO faz parte da suíte E2E: fica atrás de SHOTS=1 porque cria Reserva e
 * mexe no estado do banco só para posar para a foto — o que estragaria a
 * Disponibilidade que os outros specs afirmam.
 *
 * Uso: make screenshots  (com `docker compose up -d` no ar)
 *
 * Roda no config principal, então o globalSetup migra e popula antes. Cada
 * captura espera a tela estar pronta pelo conteúdo, nunca por timeout.
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { BIBLIOTECARIO, KEYCLOAK, LEITOR, loginUI } from './helpers'

const SAIDA = path.resolve(__dirname, '../assets/images')

/** 1440×900 em 2x — a mesma moldura das capturas já versionadas. */
const JANELA = { width: 1440, height: 900 }

test.describe('Screenshots do produto', () => {
  test.skip(process.env['SHOTS'] !== '1', 'captura de tela roda sob demanda (make screenshots)')

  test.use({ viewport: JANELA, deviceScaleFactor: 2 })

  test.beforeAll(() => {
    mkdirSync(SAIDA, { recursive: true })
  })

  async function capturar(page: Page, arquivo: string, fullPage = false): Promise<void> {
    // As capas vêm do nginx e são `loading="lazy"`: sem esperar a rede parar,
    // a foto sai com metade dos cards em branco.
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SAIDA, arquivo), fullPage })
  }

  // A entrada tem duas metades desde o ADR-0009: a nossa antessala encaminha, e
  // quem pede a credencial é o Keycloak. A foto que interessa ao README é a
  // segunda — é a que a pessoa realmente vê e usa. Que ela esteja fora do
  // DESIGN.md é a regressão registrada lá, não um defeito da captura.
  test('login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForURL(new RegExp(KEYCLOAK.replace(/^https?:\/\//, '')))
    await expect(page.locator('#kc-login')).toBeVisible()
    await capturar(page, 'login.png')
  })

  test('catálogo e detalhes do Leitor', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    await capturar(page, 'catalogo.png', true)

    await page.getByRole('link', { name: 'Ver detalhes de A Hora da Estrela' }).click()
    await expect(page.getByRole('heading', { name: 'A Hora da Estrela' })).toBeVisible()
    await capturar(page, 'detalhe-livro.png')

    // O modal de confirmação é onde as 12h da RN-1 aparecem para o Leitor.
    await page.getByRole('button', { name: 'Reservar' }).click()
    await expect(page.getByRole('heading', { name: 'Confirmar Reserva' })).toBeVisible()
    await capturar(page, 'reserva-confirmacao.png')
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await page.goto('/autores/clarice-lispector')
    await expect(page.getByRole('heading', { name: 'Clarice Lispector' })).toBeVisible()
    await capturar(page, 'detalhe-autor.png')
  })

  test('listas do Leitor', async ({ page }) => {
    await loginUI(page, LEITOR.email)

    await page.goto('/minhas-reservas')
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
    await capturar(page, 'minhas-reservas.png')

    await page.goto('/meus-emprestimos')
    await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()
    await capturar(page, 'meus-emprestimos.png')
  })

  test('balcão do Bibliotecário', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email)

    await page.goto('/bibliotecario/reservas')
    await expect(page.getByRole('heading', { name: 'Reservas', exact: true })).toBeVisible()
    await capturar(page, 'bibliotecario-reservas.png')

    await page.goto('/bibliotecario/emprestimos')
    await expect(page.getByRole('heading', { name: 'Empréstimos', exact: true })).toBeVisible()
    await capturar(page, 'bibliotecario-emprestimos.png')
  })
})
