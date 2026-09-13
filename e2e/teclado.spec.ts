/**
 * Navegação só por teclado (issue #24) — WCAG 2.1 AA, critérios 2.1.1 (Teclado),
 * 2.1.2 (Sem armadilha de foco), 2.4.1 (Pular blocos), 2.4.3 (Ordem de foco) e
 * 2.4.7 (Foco visível).
 *
 * Cada tela é percorrida com Tab do começo ao fim, e o percurso tem de cumprir:
 *
 * 1. **A primeira parada é "Pular para o conteúdo"** nas telas com trilho.
 * 2. **Todo foco se vê.** Contorno de 2px ou anel de `box-shadow` com contraste
 *    de 3:1 contra o que está *atrás dele* — não contra a página. Foi medindo
 *    assim que apareceram os três focos invisíveis desta issue: o branco do
 *    trilho sobre a porcelana da zona acesa (1,1:1), o grafite sobre o oxblood
 *    no botão Sair e no fechar do modal (1,7:1) e a lavagem oxblood nos campos
 *    do Keycloak (1,1:1). Um `expect(el).toBeFocused()` passava nos três.
 * 3. **A ordem segue a leitura** dentro do conteúdo: mesma linha, da esquerda
 *    para a direita; linha nova, de cima para baixo. O trilho fica de fora da
 *    conta porque é coluna própria à esquerda a partir de `xl`.
 * 4. **Nada fica fora do alcance**: todo controle visível e habilitado recebeu
 *    foco em algum momento do percurso.
 *
 * Os dois cenários que operam (paginação e circulação no balcão) afirmam onde o
 * foco fica depois da ação — era aí que ele se perdia no body, e o Tab seguinte
 * recomeçava do topo da página.
 */

import { expect, test, type Page } from './fixtures'
import type { Locator } from '@playwright/test'

import {
  API,
  BIBLIOTECARIO,
  LEITOR,
  SENHA_SEED,
  apiListBooks,
  apiLogin,
  apiReserveByTitle,
  emailNovo,
  keycloakOrigem,
  loginUI,
  registrarEEntrar,
} from './helpers'
import { criarLivrosAvulsos, desfazerCirculacaoDoLeitor, removerLivrosAvulsos } from './db'

/** Livro sem Cópia disponível no seed: ninguém o consome, a tela é estável. */
const LIVRO_ESTAVEL = 'Ensaio sobre a Cegueira'

/**
 * O Livro que o cenário de circulação reserva, empresta e devolve. Termina com a
 * Cópia no acervo — `regras-negocio-api` já devolveu as duas antes deste arquivo.
 */
const LIVRO_CIRCULACAO = 'O Nome de Deus'

interface Parada {
  nome: string
  noEscopo: boolean
  repetida: boolean
  caixa: { x: number; y: number; w: number; h: number }
  /** `null` quando o foco se vê; senão, o porquê. */
  indicador: string | null
}

/**
 * Descreve o elemento focado. Roda dentro da página — não pode tocar em nada
 * deste módulo, por isso as funções de cor moram aqui dentro.
 */
function sondar(escopo: string): Parada | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body || el === document.documentElement) return null

  const repetida = el.hasAttribute('data-tab-visitado')
  el.setAttribute('data-tab-visitado', '')

  type Cor = { r: number; g: number; b: number; a: number }
  const cor = (valor: string): Cor | null => {
    const m = valor.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const luminancia = (c: Cor): number => {
    const canal = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b)
  }
  const contraste = (a: Cor, b: Cor): number => {
    const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
    return (claro + 0.05) / (escuro + 0.05)
  }

  const r = el.getBoundingClientRect()
  /**
   * O que está atrás de um anel a `d` px da borda do elemento (negativo = para
   * dentro). Procura um lado que caia dentro da janela e pega o primeiro fundo
   * opaco ali — assim o link fixo sobre o trilho mede contra o oxblood, não
   * contra o body.
   */
  const fundoDoAnel = (d: number): Cor => {
    const pontos: Array<[number, number]> = [
      [r.left + r.width / 2, r.top - d],
      [r.left + r.width / 2, r.bottom + d],
      [r.left - d, r.top + r.height / 2],
      [r.right + d, r.top + r.height / 2],
    ]
    const dentro = pontos.find(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)
    if (dentro) {
      for (const alvo of document.elementsFromPoint(dentro[0], dentro[1])) {
        if (d > 0 && (alvo === el || el.contains(alvo))) continue
        for (let n: Element | null = alvo; n; n = n.parentElement) {
          const fundo = cor(getComputedStyle(n).backgroundColor)
          if (fundo && fundo.a > 0.5) return fundo
        }
      }
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  const estilo = getComputedStyle(el)
  const motivos: string[] = []
  let visivel = false

  const largura = parseFloat(estilo.outlineWidth) || 0
  const corContorno = cor(estilo.outlineColor)
  if (estilo.outlineStyle !== 'none' && largura >= 2 && corContorno && corContorno.a > 0) {
    const fundo = fundoDoAnel((parseFloat(estilo.outlineOffset) || 0) + largura / 2)
    const k = contraste(corContorno, fundo)
    if (k >= 3) visivel = true
    else motivos.push(`contorno ${estilo.outlineColor} sobre rgb(${fundo.r}, ${fundo.g}, ${fundo.b}) = ${k.toFixed(2)}:1`)
  }

  // Campo de texto: o foco é borda + anel de box-shadow (DESIGN.md, Inputs)
  if (!visivel && estilo.boxShadow !== 'none') {
    for (const sombra of estilo.boxShadow.split(/,(?![^(]*\))/)) {
      const c = cor(sombra)
      const medidas = sombra.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map((v) => parseFloat(v))
      const espalhamento = medidas[3] ?? 0
      if (!c || c.a === 0 || espalhamento < 1) continue
      const fundo = fundoDoAnel(espalhamento / 2)
      if (contraste(c, fundo) >= 3) {
        visivel = true
        break
      }
    }
    if (!visivel) motivos.push(`anel ${estilo.boxShadow} sem contraste`)
  }

  if (!visivel && motivos.length === 0) {
    motivos.push(`sem contorno nem anel (outline: ${estilo.outlineStyle} ${estilo.outlineWidth})`)
  }
  if (r.width === 0 || r.height === 0) motivos.push('elemento focado sem área na tela')

  const nome = (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)

  return {
    nome,
    noEscopo: el.closest(escopo) !== null,
    repetida,
    caixa: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height },
    indicador: visivel && motivos.length === 0 ? null : motivos.join('; '),
  }
}

/** Controles visíveis e habilitados que nenhum Tab do percurso alcançou. */
function naoAlcancados(): string[] {
  const seletor = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')
  return Array.from(document.querySelectorAll<HTMLElement>(seletor))
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        el.getAttribute('tabindex') !== '-1' &&
        !el.hasAttribute('data-tab-visitado')
      )
    })
    .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 40)}"`)
}

/**
 * Tab do começo ao fim da tela. Chame logo depois de carregar a página: o ponto
 * de partida do Tab é o topo do documento só enquanto nada recebeu foco.
 *
 * Campo com `autofocus` (o login do Keycloak) começa no meio: o que vem antes
 * dele no documento — o seletor de idioma — só se alcança com Shift+Tab. O
 * percurso anda para trás primeiro, volta ao campo e segue para a frente.
 */
async function percorrer(page: Page, escopo: string, maximo = 80): Promise<Parada[]> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  const paradas: Parada[] = []
  const inicial = await page.evaluate(sondar, escopo)
  if (inicial) {
    await page.evaluate(() => document.activeElement?.setAttribute('data-tab-inicial', ''))
    for (let i = 0; i < maximo; i++) {
      await page.keyboard.press('Shift+Tab')
      const parada = await page.evaluate(sondar, escopo)
      if (parada === null || parada.repetida) break
      paradas.unshift(parada)
    }
    paradas.push(inicial)
    // Volta ao ponto de partida por script: o que se mede é o Tab dali em diante
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-tab-inicial]')?.focus())
  }

  for (let i = 0; i < maximo; i++) {
    await page.keyboard.press('Tab')
    const parada = await page.evaluate(sondar, escopo)
    if (parada === null || parada.repetida) break
    paradas.push(parada)
  }
  return paradas
}

/** Pares consecutivos, dentro do escopo, em que o foco volta contra a leitura. */
function foraDeOrdem(paradas: Parada[]): string[] {
  const noEscopo = paradas.filter((p) => p.noEscopo)
  const saltos: string[] = []
  for (let i = 1; i < noEscopo.length; i++) {
    const a = noEscopo[i - 1].caixa
    const b = noEscopo[i].caixa
    const mesmaLinha = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0
    if (mesmaLinha ? b.x <= a.x : b.y < a.y) {
      saltos.push(`"${noEscopo[i - 1].nome}" → "${noEscopo[i].nome}"`)
    }
  }
  return saltos
}

async function conferirTela(
  page: Page,
  tela: string,
  { escopo = 'main', comTrilho = true }: { escopo?: string; comTrilho?: boolean } = {},
): Promise<void> {
  const paradas = await percorrer(page, escopo)
  const pendentes = await page.evaluate(naoAlcancados)

  expect(paradas.length, `${tela}: o Tab não parou em nada`).toBeGreaterThan(0)
  if (comTrilho) {
    expect(paradas[0].nome, `${tela}: a primeira parada do Tab`).toBe('Pular para o conteúdo')
  }
  expect(
    paradas.filter((p) => p.indicador !== null).map((p) => `"${p.nome}": ${p.indicador}`),
    `${tela}: foco sem indicador visível`,
  ).toEqual([])
  expect(foraDeOrdem(paradas), `${tela}: ordem do Tab contra a ordem visual`).toEqual([])
  expect(pendentes, `${tela}: controle que o Tab não alcança`).toEqual([])
}

/** Aperta Tab até `alvo` ter o foco — o jeito de chegar a um controle sem mouse. */
async function tabAte(page: Page, alvo: Locator, maximo = 100): Promise<void> {
  await expect(alvo).toBeVisible()
  for (let i = 0; i < maximo; i++) {
    if (await alvo.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`${maximo} Tabs e o foco não chegou a ${alvo.toString()}`)
}

test.describe('Navegação por teclado (issue #24)', () => {
  test('"Pular para o conteúdo" é a primeira parada e leva o foco ao conteúdo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()

    await page.keyboard.press('Tab')
    const pular = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(pular).toBeFocused()
    // Fora da tela até receber foco; com foco, é uma chapa legível, não 1×1px
    const caixa = await pular.boundingBox()
    expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44)

    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
    // Sem hash na URL: a âncora é só o fallback semântico, quem move é o script
    expect(new URL(page.url()).hash).toBe('')

    // O Tab seguinte já está no conteúdo — o trilho ficou para trás
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Buscar')).toBeFocused()
  })

  test('telas do Leitor: ordem, foco visível e todo controle ao alcance do Tab', async ({ page }) => {
    await loginUI(page, LEITOR.email)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
    await conferirTela(page, 'Catálogo')

    const livro = (await apiListBooks(page.request)).find((b) => b.title === LIVRO_ESTAVEL)
    expect(livro, `${LIVRO_ESTAVEL} no seed`).toBeDefined()
    await page.goto(`/livros/${livro!.id}`)
    await expect(page.getByRole('heading', { name: 'Sinopse' })).toBeVisible()
    await conferirTela(page, 'Detalhes do Livro')

    await page.goto('/autores/jose-saramago')
    await expect(page.getByRole('heading', { name: 'José Saramago' })).toBeVisible()
    await conferirTela(page, 'Detalhes do Autor')

    await page.goto('/minhas-reservas')
    await expect(page.getByRole('heading', { name: 'Minhas Reservas' })).toBeVisible()
    await conferirTela(page, 'Minhas Reservas')

    await page.goto('/meus-emprestimos')
    await expect(page.getByRole('heading', { name: 'Meus Empréstimos' })).toBeVisible()
    await conferirTela(page, 'Meus Empréstimos')
  })

  test('telas do Bibliotecário: ordem, foco visível e todo controle ao alcance do Tab', async ({ page }) => {
    await loginUI(page, BIBLIOTECARIO.email)

    await page.goto('/bibliotecario/reservas')
    await expect(page.getByRole('heading', { name: 'Reservas', exact: true })).toBeVisible()
    await conferirTela(page, 'Bibliotecário — Reservas')

    await page.goto('/bibliotecario/emprestimos')
    await expect(page.getByRole('heading', { name: 'Empréstimos', exact: true })).toBeVisible()
    await conferirTela(page, 'Bibliotecário — Empréstimos')
  })

  test('paginação do Catálogo anda com Enter e Espaço e não solta o foco no último clique', async ({ page, request }) => {
    await removerLivrosAvulsos()
    await criarLivrosAvulsos(25)
    try {
      const res = await request.get(`${API}/books?page=1&pageSize=20`)
      const { totalPages } = (await res.json()).data.pagination as { totalPages: number }
      expect(totalPages, 'o acervo precisa de mais de uma página').toBeGreaterThan(1)

      await page.goto('/')
      const indicador = page.getByText(/^Página \d+ de \d+$/)
      const anterior = page.getByRole('button', { name: 'Página anterior' })
      const proxima = page.getByRole('button', { name: 'Próxima página' })
      await expect(indicador).toHaveText(`Página 1 de ${totalPages}`)
      await expect(anterior).toBeDisabled()

      await tabAte(page, proxima)
      for (let p = 2; p <= totalPages; p++) {
        await page.keyboard.press(p % 2 === 0 ? 'Enter' : 'Space')
        await expect(indicador).toHaveText(`Página ${p} de ${totalPages}`)
        if (p < totalPages) await expect(proxima).toBeFocused()
      }
      // O botão acionado ficou desabilitado: o foco passa ao outro, não ao body
      await expect(proxima).toBeDisabled()
      await expect(anterior).toBeFocused()

      for (let p = totalPages - 1; p >= 1; p--) {
        await page.keyboard.press('Enter')
        await expect(indicador).toHaveText(`Página ${p} de ${totalPages}`)
        if (p > 1) await expect(anterior).toBeFocused()
      }
      await expect(anterior).toBeDisabled()
      await expect(proxima).toBeFocused()
    } finally {
      await removerLivrosAvulsos()
    }
  })

  test('modal prende o foco, fecha no Esc e devolve o foco a quem o abriu', async ({ page }) => {
    await loginUI(page, LEITOR.email)
    // Abrir o diálogo não reserva nada — qualquer Livro com Cópia serve
    const livro = (await apiListBooks(page.request)).find((b) => b.availableCopies > 0)
    expect(livro, 'algum Livro com Cópia disponível').toBeDefined()

    await page.goto(`/livros/${livro!.id}`)
    const reservar = page.getByRole('button', { name: 'Reservar' })
    await tabAte(page, reservar)
    await page.keyboard.press('Enter')

    const dialogo = page.getByRole('dialog', { name: 'Confirmar reserva' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo).toBeFocused()

    // Três voltas completas nos dois sentidos: o foco nunca sai do diálogo, e
    // todo foco lá dentro se vê — o X da placa oxblood inclusive
    for (const tecla of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press(tecla)
        const parada = await page.evaluate(sondar, '[role="dialog"]')
        expect(parada?.noEscopo, `${tecla} nº ${i + 1} saiu do diálogo`).toBe(true)
        expect(parada?.indicador, `${tecla} nº ${i + 1} em "${parada?.nome}"`).toBeNull()
        await page.evaluate(() => document.activeElement?.removeAttribute('data-tab-visitado'))
      }
    }

    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    await expect(reservar).toBeFocused()
  })

  test('US-10 e US-11 só com teclado: o foco fica no conteúdo quando o botão sai da linha', async ({ page, browser, request }) => {
    test.setTimeout(120_000)

    // Leitor novo a cada execução, cadastrado pela própria tela do Keycloak:
    // não disputa RN-9/RN-10 com ninguém e não exige conta nova no realm
    const email = emailNovo('e2e-teclado')
    const cadastro = await browser.newContext({ baseURL: 'http://localhost:5173', ignoreHTTPSErrors: true })
    try {
      await registrarEEntrar(await cadastro.newPage(), email)
    } finally {
      await cadastro.close()
    }
    const { token, user } = await apiLogin(request, email)

    try {
      await apiReserveByTitle(request, token, LIVRO_CIRCULACAO)
      await loginUI(page, BIBLIOTECARIO.email)

      // Efetivar — a linha some da lista "Ativas" depois do refetch
      await page.goto('/bibliotecario/reservas')
      await expect(page.getByRole('heading', { name: 'Reservas', exact: true })).toBeVisible()
      const efetivar = page.getByRole('row').filter({ hasText: email }).getByRole('button', { name: 'Efetivar empréstimo' })
      await tabAte(page, efetivar)
      await page.keyboard.press('Enter')

      const dialogoEmprestimo = page.getByRole('dialog', { name: 'Efetivar empréstimo' })
      await expect(dialogoEmprestimo).toBeVisible()
      await tabAte(page, dialogoEmprestimo.getByRole('button', { name: 'Confirmar empréstimo' }))
      await page.keyboard.press('Enter')

      await expect(page.getByText(/Empréstimo registrado\./)).toBeVisible()
      await expect(efetivar).toHaveCount(0)
      await expect(page.locator('main')).toBeFocused()
      await page.keyboard.press('Tab')
      expect(
        await page.evaluate(() => document.activeElement?.closest('main') !== null),
        'o Tab depois de efetivar continua no conteúdo, não recomeça do trilho',
      ).toBe(true)

      // Devolver com Espaço — a linha fica ("Devolvido"), o botão sai dela
      await page.goto('/bibliotecario/emprestimos')
      await expect(page.getByRole('heading', { name: 'Empréstimos', exact: true })).toBeVisible()
      const linha = page.getByRole('row').filter({ hasText: email })
      const devolver = linha.getByRole('button', { name: 'Registrar devolução' })
      await tabAte(page, devolver)
      await page.keyboard.press('Space')

      const dialogoDevolucao = page.getByRole('dialog', { name: 'Confirmar devolução' })
      await expect(dialogoDevolucao).toBeVisible()
      await tabAte(page, dialogoDevolucao.getByRole('button', { name: 'Confirmar devolução' }))
      await page.keyboard.press('Enter')

      await expect(page.getByText('Devolução registrada com sucesso.')).toBeVisible()
      await expect(linha).toContainText('Devolvido')
      await expect(devolver).toHaveCount(0)
      await expect(page.locator('main')).toBeFocused()
    } finally {
      await desfazerCirculacaoDoLeitor(user.id)
    }
  })

  test('Keycloak: login e cadastro percorridos e operados só com teclado', async ({ page }) => {
    await page.goto('/login')
    await page.waitForURL(keycloakOrigem())
    await expect(page.locator('#username')).toBeFocused()
    await conferirTela(page, 'Keycloak — login', { escopo: 'body', comTrilho: false })

    // Do login para o cadastro, e o formulário de cadastro inteiro
    await tabAte(page, page.getByRole('link', { name: /Cadastre-se/ }))
    await page.keyboard.press('Enter')
    await expect(page.locator('#email')).toBeVisible()
    await conferirTela(page, 'Keycloak — cadastro', { escopo: 'body', comTrilho: false })

    // De volta, e entrar sem tocar no mouse: o campo de e-mail já vem com foco
    await tabAte(page, page.getByRole('link', { name: /Voltar ao Login/ }))
    await page.keyboard.press('Enter')
    await expect(page.locator('#username')).toBeFocused()
    await page.keyboard.type(LEITOR.email)
    await page.keyboard.press('Tab')
    await expect(page.locator('#password')).toBeFocused()
    await page.keyboard.type(SENHA_SEED)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: 'Catálogo de Livros' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
  })
})
