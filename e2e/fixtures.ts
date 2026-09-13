import { test as base, type BrowserContext, type TestInfo } from '@playwright/test'

export { expect, type Page } from '@playwright/test'

/**
 * O que o navegador reclamou durante um teste — issue #32.
 *
 * Sem isto a suíte só enxerga o que as asserções olham: um `console.error`, uma
 * exceção não tratada no React ou uma requisição abortada passam em silêncio
 * sempre que a tela ainda mostra o esperado. Foi assim em #27, em que a única
 * pista do Keycloak inacessível (`net::ERR_CERT_AUTHORITY_INVALID`) estava no
 * console e nenhum teste a viu.
 */
export interface OcorrenciaNavegador {
  tipo: 'console' | 'pageerror' | 'requestfailed'
  /** `error`/`warning` do console; vazio para as outras duas. */
  nivel: string
  texto: string
  /** Onde aconteceu: script do console, URL da requisição ou página da exceção. */
  origem: string
}

export const ANEXO_NAVEGADOR = 'console-navegador'

interface ErroEsperado {
  padrao: RegExp
  motivo: string
}

interface FixturesNavegador {
  /**
   * Declara uma reclamação do navegador que o cenário provoca de propósito — o
   * 409 de uma Reserva vencida no balcão, por exemplo. O padrão é testado contra
   * `texto` e `origem` da ocorrência; o motivo aparece na falha se ela não vier.
   */
  erroEsperado: (padrao: RegExp, motivo: string) => void
  _errosEsperados: ErroEsperado[]
}

function escutar(context: BrowserContext, ocorrencias: OcorrenciaNavegador[]): void {
  context.on('console', (msg) => {
    const nivel = msg.type()
    if (nivel !== 'error' && nivel !== 'warning') return
    const { url, lineNumber } = msg.location()
    ocorrencias.push({
      tipo: 'console',
      nivel,
      texto: msg.text(),
      origem: url ? `${url}:${String(lineNumber)}` : (msg.page()?.url() ?? ''),
    })
  })
  context.on('weberror', (webError) => {
    const erro = webError.error()
    ocorrencias.push({
      tipo: 'pageerror',
      nivel: '',
      texto: erro.stack ?? erro.message,
      origem: webError.page()?.url() ?? '',
    })
  })
  context.on('requestfailed', (request) => {
    ocorrencias.push({
      tipo: 'requestfailed',
      nivel: '',
      texto: `${request.method()} ${request.failure()?.errorText ?? 'falhou'}`,
      origem: request.url(),
    })
  })
}

async function anexar(testInfo: TestInfo, ocorrencias: OcorrenciaNavegador[]): Promise<void> {
  if (ocorrencias.length === 0) return
  await testInfo.attach(ANEXO_NAVEGADOR, {
    body: JSON.stringify(ocorrencias, null, 2),
    contentType: 'application/json',
  })
}

const descrever = (o: OcorrenciaNavegador): string =>
  `  - [${o.tipo}${o.nivel ? `/${o.nivel}` : ''}] ${o.texto.split('\n')[0] ?? ''} (${o.origem})`

/**
 * Confronta o capturado com o declarado. Falha nos dois sentidos: ocorrência que
 * ninguém declarou é o defeito que a issue #32 existe para pegar; declaração que
 * não aconteceu é exceção velha, que um dia esconderia um erro de verdade.
 */
function conferir(ocorrencias: OcorrenciaNavegador[], esperados: ErroEsperado[]): void {
  const cobre = (e: ErroEsperado, o: OcorrenciaNavegador): boolean =>
    e.padrao.test(o.texto) || e.padrao.test(o.origem)

  const inesperadas = ocorrencias.filter((o) => !esperados.some((e) => cobre(e, o)))
  const naoVistos = esperados.filter((e) => !ocorrencias.some((o) => cobre(e, o)))

  const partes: string[] = []
  if (inesperadas.length > 0) {
    partes.push(
      'O navegador reclamou de algo que o cenário não declarou (anexo console-navegador):',
      ...inesperadas.map(descrever),
      'Defeito da aplicação: corrija. Provocado pelo cenário: declare com erroEsperado(padrão, motivo).',
    )
  }
  if (naoVistos.length > 0) {
    partes.push(
      'erroEsperado declarado, mas o navegador não reclamou — remova a declaração:',
      ...naoVistos.map((e) => `  - ${String(e.padrao)} — ${e.motivo}`),
    )
  }
  if (partes.length > 0) throw new Error(partes.join('\n'))
}

/**
 * `test` dos specs de UI. Sobrescreve `context`, não `page`: assim a captura
 * cobre toda página que o contexto abrir — inclusive o redirecionamento para o
 * Keycloak — e não só a primeira.
 *
 * Toda reclamação do navegador reprova o teste, salvo as declaradas com
 * `erroEsperado`. O capturado vira anexo no relatório HTML (no CI, o artefato
 * `playwright-report`) antes da conferência, então aparece também na falha.
 * Specs só de API não abrem navegador e continuam importando de `@playwright/test`.
 */
export const test = base.extend<FixturesNavegador>({
  _errosEsperados: async ({}, use) => {
    await use([])
  },
  erroEsperado: async ({ _errosEsperados }, use) => {
    await use((padrao, motivo) => {
      _errosEsperados.push({ padrao, motivo })
    })
  },
  context: async ({ context, _errosEsperados }, use, testInfo) => {
    const ocorrencias: OcorrenciaNavegador[] = []
    escutar(context, ocorrencias)
    await use(context)
    await anexar(testInfo, ocorrencias)
    // Teste que já falhou não ganha uma segunda falha por cima da primeira: a
    // asserção interrompida pode ter deixado o erro esperado sem acontecer.
    if (testInfo.status === testInfo.expectedStatus) conferir(ocorrencias, _errosEsperados)
  },
})
