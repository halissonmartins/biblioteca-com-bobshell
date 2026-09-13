/**
 * Tradução do erro do fluxo OIDC para o que a tela de acesso mostra.
 *
 * Mora em `utils/` porque o que chega do `react-oidc-context` é o erro cru do
 * `fetch` do navegador — "Failed to fetch" no Chromium, "NetworkError when
 * attempting to fetch resource" no Firefox, "Load failed" no Safari. Nenhuma
 * dessas frases diz a quem está tentando entrar o que aconteceu, e nenhuma
 * delas está em português.
 *
 * O detalhe técnico não se joga fora: ele vai junto, em texto menor, porque no
 * caso que originou isto (CA local de `make certs` ainda não confiável no SO)
 * a única pista existia no console do navegador — quem usava não tinha o que
 * reportar.
 */

export interface ErroDeAcesso {
  /** Frase para a pessoa: o que houve e o que dá para fazer. */
  mensagem: string
  /** Texto cru do erro, para colar num chamado. `null` quando não acrescenta nada. */
  detalhe: string | null
}

/**
 * Marcas de falha de rede ou de TLS nas mensagens dos navegadores e do
 * `oidc-client-ts`. Comparadas em minúsculas.
 */
const MARCAS_DE_REDE = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'timed out',       // ErrorTimeout do oidc-client-ts
  'timeout',
  'err_cert',
  'err_connection',
  'certificate',
  'ssl',
]

const FALHA_DE_REDE =
  'Não foi possível falar com o serviço de acesso. Ele pode estar fora do ar ' +
  'ou a rede pode estar bloqueando a conexão. Tente de novo em instantes.'

// Não repete o subtítulo da tela ("Não foi possível abrir a tela de acesso."):
// a frase aqui existe para dizer o que fazer, não para redizer o que houve.
const FALHA_GENERICA =
  'Tente de novo. Se o problema continuar, procure a equipe da biblioteca.'

/** Extrai a mensagem de qualquer coisa que tenha caído no lugar de um erro. */
function mensagemCrua(erro: unknown): string {
  // Stryker disable next-line ConditionalExpression: equivalente — Error tem `message` string, e o ramo de objeto abaixo devolve o mesmo texto
  if (erro instanceof Error) return erro.message
  if (typeof erro === 'string') return erro
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalente — `erro` já é truthy aqui, e primitivo desestruturado dá `message` não-string, que cai no mesmo return ''
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const { message } = erro as { message: unknown }
    if (typeof message === 'string') return message
  }
  return ''
}

/**
 * Descreve a falha do fluxo de acesso, ou `null` quando não houve falha.
 *
 * Aceita `unknown` de propósito: recebe tanto o `ErrorContext` do
 * `react-oidc-context` quanto o que uma rejeição futura de `signinRedirect()`
 * venha a trazer.
 */
export function descreverErroDeAcesso(erro: unknown): ErroDeAcesso | null {
  if (!erro) return null

  const crua = mensagemCrua(erro).trim()
  const normalizada = crua.toLowerCase()
  const deRede = MARCAS_DE_REDE.some((marca) => normalizada.includes(marca))
  const mensagem = deRede ? FALHA_DE_REDE : FALHA_GENERICA

  // Só vale mostrar o detalhe quando ele acrescenta algo à frase escolhida.
  const detalhe = crua && crua !== mensagem ? crua : null

  return { mensagem, detalhe }
}
