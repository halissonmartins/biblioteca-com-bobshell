/**
 * Captura os dashboards do Grafana para assets/images/dashboards/.
 *
 * NÃO faz parte da suíte E2E: fica atrás de OBS=1 porque exige a stack de
 * observabilidade no ar (`make obs-up`), que o CI não sobe.
 *
 * Uso: make obs-dashboards
 *
 * Roda com `playwright.dashboards.config.ts`, que não tem globalSetup nem
 * webServer — o config principal roda seed antes da suíte e apagaria os dados
 * que acabaram de popular os dashboards.
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const GRAFANA = process.env['GRAFANA_URL'] ?? 'http://localhost:3001'
const SAIDA = path.resolve(__dirname, '../assets/images/dashboards')

const DASHBOARDS = [
  { uid: 'biblioteca-negocio', arquivo: 'negocio.png' },
  { uid: 'biblioteca-slo', arquivo: 'slo.png' },
  { uid: 'biblioteca-saude-api', arquivo: 'saude-api.png' },
  { uid: 'otel-http-services', arquivo: 'otel-http-services.png' },
]

test.describe('Screenshots dos dashboards', () => {
  test.skip(process.env['OBS'] !== '1', 'requer a stack de observabilidade (make obs-up)')

  // Viewport alto para caber o máximo de painéis sem depender do lazy render.
  test.use({ viewport: { width: 1600, height: 2200 } })

  test.beforeAll(() => {
    mkdirSync(SAIDA, { recursive: true })
  })

  for (const { uid, arquivo } of DASHBOARDS) {
    test(`captura ${uid}`, async ({ page }) => {
      // kiosk esconde o menu e a barra superior; a janela de 3 h cobre a carga
      // K6 mesmo que os screenshots sejam tirados algum tempo depois.
      await page.goto(`${GRAFANA}/d/${uid}?kiosk&from=now-3h&to=now`, {
        waitUntil: 'networkidle',
      })

      // Espera todos os painéis terminarem de carregar. O Grafana marca os
      // painéis em carregamento com data-testid="panel-loading-bar".
      await page
        .waitForFunction(
          () => document.querySelectorAll('[data-testid="panel-loading-bar"]').length === 0,
          undefined,
          { timeout: 30_000 },
        )
        .catch(() => {
          /* seguimos mesmo assim: melhor um screenshot do que nenhum */
        })

      // O Grafana desenha o canvas de um painel só quando ele entra na viewport.
      // Sem rolar a página inteira primeiro, `fullPage` captura os painéis de
      // baixo com a legenda montada e a área do gráfico em branco.
      await page.evaluate(async () => {
        const alvo = document.querySelector('.scrollbar-view, .main-view') ?? document.scrollingElement
        if (alvo === null) return
        const passo = 400
        for (let y = 0; y <= alvo.scrollHeight; y += passo) {
          alvo.scrollTop = y
          await new Promise((r) => setTimeout(r, 150))
        }
        alvo.scrollTop = 0
        await new Promise((r) => setTimeout(r, 500))
      })

      // Margem para as animações de entrada dos gráficos assentarem.
      await page.waitForTimeout(4_000)

      // Falha explícita se o dashboard não renderizou nenhum painel — sem isto,
      // uma página em branco viraria um PNG aparentemente válido.
      await expect(page.locator('[data-testid^="data-testid Panel header"]').first()).toBeVisible({
        timeout: 15_000,
      })

      // Recorta na altura real do conteúdo: a viewport é propositalmente mais
      // alta que a maioria dos dashboards, e `fullPage` sozinho deixaria uma
      // faixa em branco no rodapé.
      const alturaConteudo = await page.evaluate(() => {
        // `[data-panelid]` deixou de existir no Grafana 13 — sem o fallback pela
        // célula do grid, o cálculo devolvia null e o `fullPage` gravava a
        // viewport inteira, com faixa em branco no rodapé.
        const paineis = Array.from(
          document.querySelectorAll('[data-panelid], .react-grid-item'),
        )
        if (paineis.length === 0) return null
        const base = Math.min(...paineis.map((p) => p.getBoundingClientRect().top))
        const fim = Math.max(...paineis.map((p) => p.getBoundingClientRect().bottom))
        return Math.ceil(fim - base + Math.max(base, 0) + 24)
      })

      await page.screenshot({
        path: path.join(SAIDA, arquivo),
        ...(alturaConteudo !== null
          ? { clip: { x: 0, y: 0, width: 1600, height: alturaConteudo } }
          : { fullPage: true }),
      })
    })
  }
})
