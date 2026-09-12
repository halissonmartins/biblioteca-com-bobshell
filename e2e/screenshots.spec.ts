/**
 * Captura as telas do produto para assets/images/, que alimentam o README e o
 * registro de layout responsivo (docs/design/responsivo.md).
 *
 * NÃO faz parte da suíte E2E: fica atrás de SHOTS=1 porque mexe no estado da
 * tela só para posar para a foto — o que estragaria a Disponibilidade que os
 * outros specs afirmam.
 *
 * Uso: make screenshots  (com `docker compose up -d` no ar)
 *
 * Roda no config principal, então o globalSetup migra e popula antes. Cada
 * captura espera a tela estar pronta pelo conteúdo, nunca por timeout.
 *
 * **Três molduras, um mecanismo.** A moldura larga grava o nome simples
 * (`catalogo.png`); as duas estreitas acrescentam o sufixo do aparelho
 * (`catalogo-smartphone.png`, `catalogo-tablet.png`). Captura de celular feita à
 * mão sai do lugar no primeiro ajuste de UI — por isso tudo nasce daqui, do
 * mesmo comando (issue #21).
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { BIBLIOTECARIO, KEYCLOAK, LEITOR, loginUI } from './helpers'

const SAIDA = path.resolve(__dirname, '../assets/images')

/**
 * As molduras. A larga é a de sempre — 1440×900 em 2x, com o trilho de zona na
 * lateral. As duas estreitas são as larguras de referência da issue #21, onde o
 * trilho é a placa do topo e a tabela vira ficha; emulam toque porque os pisos
 * de 44px do design system vivem em `@media (pointer: coarse)`.
 */
const MOLDURAS = [
  { sufixo: '',            width: 1440, height: 900,  toque: false },
  { sufixo: '-smartphone', width: 390,  height: 844,  toque: true  },
  { sufixo: '-tablet',     width: 768,  height: 1024, toque: true  },
]

test.describe('Screenshots do produto', () => {
  test.skip(process.env['SHOTS'] !== '1', 'captura de tela roda sob demanda (make screenshots)')

  test.beforeAll(() => {
    mkdirSync(SAIDA, { recursive: true })
  })

  async function capturar(page: Page, arquivo: string, fullPage = false): Promise<void> {
    // As capas vêm do nginx e são `loading="lazy"`: sem esperar a rede parar,
    // a foto sai com metade dos cards em branco.
    //
    // O limite existe porque `networkidle` nunca chega nas molduras estreitas: a
    // grade em duas colunas deixa capas abaixo da dobra, o Chromium mantém a
    // requisição adiada em voo e a espera ia até o timeout do teste. O que
    // interessa à foto é o que está na tela, e isso o `waitForFunction` abaixo
    // já confere — as imagens visíveis terminam de decodificar antes dele.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // Nenhuma tela do produto repousa em "Carregando…": se ele estiver visível,
    // a query ainda não resolveu e a foto sai no estado transitório — já aconteceu
    // com o detalhe do Livro, cujo título também existe no card do catálogo.
    await page.waitForFunction(() => !document.body?.innerText.includes('Carregando'))
    await page.screenshot({ path: path.join(SAIDA, arquivo), fullPage })
  }

  // A entrada tem duas metades desde o ADR-0009: a nossa antessala encaminha, e
  // quem pede a credencial é o Keycloak. A foto que interessa ao README é a
  // segunda — é a que a pessoa realmente vê e usa. Que ela esteja fora do
  // DESIGN.md é a regressão registrada lá, não um defeito da captura.
  //
  // Só na moldura larga: a tela é do tema do Keycloak, não do nosso mundo, e
  // registrar o layout dela no celular seria documentar produto alheio.
  test.describe('moldura larga', () => {
    test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

    test('login', async ({ page }) => {
      await page.goto('/login')
      await page.waitForURL(new RegExp(KEYCLOAK.replace(/^https?:\/\//, '')))
      await expect(page.locator('#kc-login')).toBeVisible()
      await capturar(page, 'login.png')
    })
  })

  for (const moldura of MOLDURAS) {
    test.describe(`moldura ${moldura.sufixo || 'larga'}`, () => {
      test.use({
        viewport: { width: moldura.width, height: moldura.height },
        deviceScaleFactor: 2,
        hasTouch: moldura.toque,
        isMobile: moldura.toque,
      })

      test('catálogo e detalhes do Leitor', async ({ page }) => {
        await loginUI(page, LEITOR.email)
        // A página inteira só na moldura larga: no celular a grade de 20 Livros
        // em duas colunas viraria uma tira de dez mil pixels de altura.
        await capturar(page, `catalogo${moldura.sufixo}.png`, moldura.sufixo === '')

        await page.getByRole('link', { name: 'Ver detalhes de A Hora da Estrela' }).click()
        // O heading do título também existe no card do catálogo — esperar por ele
        // passa antes da navegação SPA trocar o DOM, e a foto saía no loading.
        // "Sinopse" só existe na página de detalhe.
        await expect(page.getByRole('heading', { name: 'Sinopse' })).toBeVisible()
        await capturar(page, `detalhe-livro${moldura.sufixo}.png`)

        // O modal de confirmação é onde as 12h da RN-1 aparecem para o Leitor —
        // e, no celular, onde as ações empilham em largura cheia.
        await page.getByRole('button', { name: 'Reservar' }).click()
        await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toBeVisible()
        if (moldura.sufixo !== '-tablet') {
          await capturar(page, `reserva-confirmacao${moldura.sufixo}.png`)
        }
        await page.getByRole('button', { name: 'Cancelar' }).click()

        await page.goto('/autores/clarice-lispector')
        await expect(page.getByRole('heading', { name: 'Clarice Lispector' })).toBeVisible()
        await capturar(page, `detalhe-autor${moldura.sufixo}.png`)
      })

      test('listas do Leitor', async ({ page }) => {
        await loginUI(page, LEITOR.email)

        await page.goto('/minhas-reservas')
        await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
        await capturar(page, `minhas-reservas${moldura.sufixo}.png`)

        await page.goto('/meus-emprestimos')
        await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()
        await capturar(page, `meus-emprestimos${moldura.sufixo}.png`)
      })

      test('balcão do Bibliotecário', async ({ page }) => {
        await loginUI(page, BIBLIOTECARIO.email)

        await page.goto('/bibliotecario/reservas')
        await expect(page.getByRole('heading', { name: 'Reservas', exact: true })).toBeVisible()
        await capturar(page, `bibliotecario-reservas${moldura.sufixo}.png`)

        await page.goto('/bibliotecario/emprestimos')
        await expect(page.getByRole('heading', { name: 'Empréstimos', exact: true })).toBeVisible()
        await capturar(page, `bibliotecario-emprestimos${moldura.sufixo}.png`)
      })
    })
  }
})
