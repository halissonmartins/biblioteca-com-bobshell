/**
 * Testes da tradução do erro do fluxo OIDC (issue #27).
 *
 * O caso que originou o defeito é o discovery do Keycloak falhando: o navegador
 * devolve "Failed to fetch" e o `react-oidc-context` embrulha isso num
 * `ErrorContext` com `source`. A tela precisa de uma frase em português a
 * partir daí — sem perder o texto cru, que era a única pista disponível.
 */

import { describe, expect, it } from 'vitest'

import { descreverErroDeAcesso } from './authError'

describe('descreverErroDeAcesso', () => {
  it('devolve null quando não houve erro', () => {
    expect(descreverErroDeAcesso(undefined)).toBeNull()
    expect(descreverErroDeAcesso(null)).toBeNull()
  })

  it('reconhece a falha de rede do Chromium', () => {
    const erro = descreverErroDeAcesso(new TypeError('Failed to fetch'))
    expect(erro?.mensagem).toContain('Não foi possível falar com o serviço de acesso')
    expect(erro?.detalhe).toBe('Failed to fetch')
  })

  it('reconhece a falha de rede do Firefox e do Safari', () => {
    const firefox = descreverErroDeAcesso(
      new TypeError('NetworkError when attempting to fetch resource.'),
    )
    const safari = descreverErroDeAcesso(new TypeError('Load failed'))
    expect(firefox?.mensagem).toContain('serviço de acesso')
    expect(safari?.mensagem).toContain('serviço de acesso')
  })

  it('reconhece o estouro de tempo — Keycloak que não recusa nem responde', () => {
    // `ErrorTimeout` do oidc-client-ts quando `requestTimeoutInSeconds` aborta
    // a descoberta. Sem esse timeout configurado em main.tsx, o fetch não tinha
    // AbortController e a tela ficava muda para sempre.
    const erro = descreverErroDeAcesso(new Error('Network timed out'))
    expect(erro?.mensagem).toContain('serviço de acesso')
    expect(erro?.detalhe).toBe('Network timed out')
  })

  it('reconhece a CA local não confiável — o caso do `make certs`', () => {
    const erro = descreverErroDeAcesso(new Error('net::ERR_CERT_AUTHORITY_INVALID'))
    expect(erro?.mensagem).toContain('serviço de acesso')
    expect(erro?.detalhe).toBe('net::ERR_CERT_AUTHORITY_INVALID')
  })

  it('lê o `ErrorContext` do react-oidc-context, que carrega `source`', () => {
    // Formato real da v3.3.1: objeto normalizado, não instância de Error.
    const contexto = {
      name: 'TypeError',
      message: 'Failed to fetch',
      source: 'signinRedirect',
      innerError: new TypeError('Failed to fetch'),
    }
    expect(descreverErroDeAcesso(contexto)?.detalhe).toBe('Failed to fetch')
  })

  it('cai na frase genérica para erro que não é de rede', () => {
    const erro = descreverErroDeAcesso(new Error('invalid_client'))
    expect(erro?.mensagem).toBe(
      'Tente de novo. Se o problema continuar, procure a equipe da biblioteca.',
    )
    expect(erro?.detalhe).toBe('invalid_client')
  })

  it('apara espaços do texto cru antes de mostrar o detalhe', () => {
    const erro = descreverErroDeAcesso(new Error('  invalid_client \n'))
    expect(erro?.detalhe).toBe('invalid_client')
  })

  it('aceita erro que chegou como string', () => {
    expect(descreverErroDeAcesso('Failed to fetch')?.mensagem).toContain('serviço de acesso')
  })

  it('ignora `message` que não é string', () => {
    expect(descreverErroDeAcesso({ message: 42 })?.detalhe).toBeNull()
  })

  it('sempre devolve mensagem, mesmo sem texto aproveitável', () => {
    const erro = descreverErroDeAcesso({ semMensagem: true })
    expect(erro?.mensagem).toBeTruthy()
    expect(erro?.detalhe).toBeNull()
  })

  it('não repete o detalhe quando ele é igual à mensagem', () => {
    const erro = descreverErroDeAcesso(
      new Error('Tente de novo. Se o problema continuar, procure a equipe da biblioteca.'),
    )
    expect(erro?.detalhe).toBeNull()
  })
})
