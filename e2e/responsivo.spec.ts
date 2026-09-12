/**
 * As sete telas do produto nas três larguras de referência (issue #21).
 *
 * O que este spec afirma é o que "responsivo" significa aqui, e nada além:
 *
 * 1. **Nenhuma tela rola na horizontal.** Rolagem horizontal de página é o
 *    sintoma clássico de layout quebrado no celular: o conteúdo à direita some
 *    e ninguém vai procurar por ele.
 * 2. **Nenhum contêiner esconde conteúdo num overflow silencioso.** A tabela do
 *    balcão tem `overflow-x: auto` — ela não empurra a página, ela engole a
 *    coluna de ação sem avisar. Era o que acontecia no tablet em retrato antes
 *    desta issue: 740px de tabela dentro de 718px de contêiner.
 * 3. **Todo alvo de toque tem 44×44.** Piso da WCAG 2.5.5 e da diretriz de
 *    mobile do DESIGN.md. Ele vale para ponteiro grosso, e por isso os três
 *    perfis abaixo emulam toque: `.link-registro` e `.link-caminho` sobem de
 *    24px para 44px por `@media (pointer: coarse)`, então sem `hasTouch` o
 *    teste mediria a régua do mouse e passaria por engano.
 *
 * Link no meio de frase — o nome do Autor em "por Clarice Lispector" — fica de
 * fora: a WCAG 2.5.8 abre exceção para ele, e engordar um link inline quebraria
 * a linha da prosa. Por isso a varredura olha controles, não todo `<a>`.
 *
 * Não cria Reserva nem Empréstimo: só navega e mede. Pode rodar em qualquer
 * ponto da suíte sem mexer na Disponibilidade que os outros specs afirmam.
 */

import { expect, test, type Page } from '@playwright/test'

import { BIBLIOTECARIO, LEITOR, loginUI } from './helpers'

/** As três larguras da issue #21 — celular, tablet em retrato e em paisagem. */
const LARGURAS = [
  { nome: 'smartphone',      width: 390,  height: 844 },
  { nome: 'tablet-retrato',  width: 768,  height: 1024 },
  { nome: 'tablet-paisagem', width: 1024, height: 768 },
]

/** Livro sem Cópia disponível no seed: ninguém o consome, então a tela é estável. */
const LIVRO = 'Ensaio sobre a Cegueira'

/**
 * Controles que o dedo acerta. `<a>` genérico não entra: link de prosa tem
 * exceção na WCAG 2.5.8, e as classes abaixo são justamente os links que **não**
 * são prosa — título de Livro na linha da tabela, caminho, zona do trilho.
 */
const CONTROLES = 'button, a.link-registro, a.link-caminho, a.zona-link, a.zona-link-ativo'

interface Achados {
  documento: { cliente: number; rolagem: number }
  forado:    string[]
  engolido:  string[]
  alvos:     string[]
}

async function medirLayout(page: Page): Promise<Achados> {
  // As capas vêm do nginx e são `loading="lazy"`: medir antes de a rede parar
  // pega a grade no meio do salto.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

  return page.evaluate((controles) => {
    const raiz = document.documentElement
    const largura = raiz.clientWidth

    /**
     * Elemento clipado — o `thead` que vira `sr-only` na ficha, por exemplo —
     * tem caixa larga dentro de um ancestral de 1px. Não está na tela, não conta
     * como estouro.
     */
    const invisivel = (el: Element): boolean => {
      for (let pai = el.parentElement; pai; pai = pai.parentElement) {
        const estilo = getComputedStyle(pai)
        if (estilo.display === 'none' || estilo.visibility === 'hidden') return true
        if (pai.clientWidth <= 1 && estilo.overflow !== 'visible') return true
      }
      return false
    }

    const descrever = (el: Element): string => {
      const classes = String(el.className ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      return `${el.tagName.toLowerCase()}${classes.length ? `.${classes.join('.')}` : ''}`
    }

    const forado: string[] = []
    const engolido: string[] = []
    const alvos: string[] = []

    document.querySelectorAll('body *').forEach((el) => {
      const caixa = el.getBoundingClientRect()
      if (caixa.width === 0 || invisivel(el)) return
      if (caixa.right > largura + 1 || caixa.left < -1) {
        forado.push(`${descrever(el)} [${Math.round(caixa.left)}..${Math.round(caixa.right)}]`)
      }
    })

    // Contêineres que rolam escondendo conteúdo. A faixa de zonas do trilho fica
    // fora da lista de propósito: ela rola no celular por desenho (DESIGN.md).
    document.querySelectorAll('.table-container, .card, main, .modal').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1 && !invisivel(el)) {
        engolido.push(`${descrever(el)} ${el.clientWidth}→${el.scrollWidth}`)
      }
    })

    document.querySelectorAll(controles).forEach((el) => {
      const caixa = el.getBoundingClientRect()
      if (caixa.width === 0 || invisivel(el)) return
      if (caixa.height < 44 || caixa.width < 44) {
        const texto = (el.textContent ?? '').trim().slice(0, 24)
        alvos.push(`${descrever(el)} "${texto}" ${Math.round(caixa.width)}×${Math.round(caixa.height)}`)
      }
    })

    return { documento: { cliente: raiz.clientWidth, rolagem: raiz.scrollWidth }, forado, engolido, alvos }
  }, CONTROLES)
}

/** Roda as afirmações sobre a tela atual, nomeando a tela na falha. */
async function conferir(page: Page, tela: string): Promise<void> {
  const achados = await medirLayout(page)

  expect(achados.forado, `${tela}: elemento fora do quadro`).toEqual([])
  expect(achados.engolido, `${tela}: conteúdo escondido em overflow horizontal`).toEqual([])
  expect(achados.alvos, `${tela}: alvo de toque abaixo de 44×44`).toEqual([])
  expect(achados.documento.rolagem, `${tela}: a página rola na horizontal`).toBeLessThanOrEqual(
    achados.documento.cliente + 1,
  )
}

for (const largura of LARGURAS) {
  test.describe(`Layout em ${largura.nome} (${largura.width}px)`, () => {
    // `hasTouch`/`isMobile`: sem eles o Chromium reporta ponteiro fino e as
    // regras de 44px do `@media (pointer: coarse)` nem entram na conta.
    test.use({
      viewport: { width: largura.width, height: largura.height },
      hasTouch: true,
      isMobile: true,
    })

    test('telas do Leitor', async ({ page }) => {
      await loginUI(page, LEITOR.email)
      await conferir(page, 'Catálogo')

      await page.getByRole('link', { name: `Ver detalhes de ${LIVRO}` }).click()
      // O heading do título também existe no card do catálogo; "Sinopse" só
      // existe na página de detalhe.
      await expect(page.getByRole('heading', { name: 'Sinopse' })).toBeVisible()
      await conferir(page, 'Detalhes do Livro')

      await page.goto('/autores/clarice-lispector')
      await expect(page.getByRole('heading', { name: 'Clarice Lispector' })).toBeVisible()
      await conferir(page, 'Detalhes do Autor')

      await page.goto('/minhas-reservas')
      await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
      await conferir(page, 'Minhas Reservas')

      await page.goto('/meus-emprestimos')
      await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()
      await conferir(page, 'Meus Empréstimos')
    })

    test('telas do Bibliotecário', async ({ page }) => {
      await loginUI(page, BIBLIOTECARIO.email)

      await page.goto('/bibliotecario/reservas')
      await expect(page.getByRole('heading', { name: 'Reservas', exact: true })).toBeVisible()
      await conferir(page, 'Bibliotecário — Reservas')

      await page.goto('/bibliotecario/emprestimos')
      await expect(page.getByRole('heading', { name: 'Empréstimos', exact: true })).toBeVisible()
      await conferir(page, 'Bibliotecário — Empréstimos')
    })
  })
}
