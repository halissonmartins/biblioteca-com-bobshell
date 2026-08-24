/**
 * Testes do HTTP client base.
 * Toda chamada da SPA passa por `request()` — token no sessionStorage,
 * envelope de erro da API virando ApiRequestError, 204 sem corpo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearToken,
  isApiRequestError,
  makeApiRequestError,
  request,
  setToken,
} from './client'

function stubFetch(resposta: Partial<Response> & { json?: () => Promise<unknown> }): {
  ultimaChamada: () => { url: string; init: RequestInit }
} {
  const mock = vi.fn().mockResolvedValue(resposta)
  vi.stubGlobal('fetch', mock)
  return {
    // mock.mock.calls guarda a tupla [url, init] — aqui viram campos nomeados.
    ultimaChamada: () => {
      const [url, init] = mock.mock.calls[mock.mock.calls.length - 1] as [string, RequestInit]
      return { url, init }
    },
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('monta a URL sob /api e injeta o Bearer do sessionStorage', async () => {
    setToken('jwt-de-teste')
    const { ultimaChamada } = stubFetch({ ok: true, status: 200, json: async () => ({ ok: true }) })

    await request('/me')

    const { url, init } = ultimaChamada()
    expect(url).toBe('/api/me')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-de-teste')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('não manda Authorization sem token', async () => {
    const { ultimaChamada } = stubFetch({ ok: true, status: 200, json: async () => ({}) })

    await request('/books')

    const { init } = ultimaChamada()
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('preserva headers extras e corpo do chamador', async () => {
    const { ultimaChamada } = stubFetch({ ok: true, status: 200, json: async () => ({}) })

    await request('/loans', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'abc' },
      body: JSON.stringify({ copyId: 'c1' }),
    })

    const { init } = ultimaChamada()
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ copyId: 'c1' }))
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('abc')
  })

  it('devolve undefined para 204 sem corpo', async () => {
    stubFetch({ ok: true, status: 204 })

    const resultado = await request<void>('/reservations/r1')

    expect(resultado).toBeUndefined()
  })

  it('converte o envelope de erro da API em ApiRequestError', async () => {
    stubFetch({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'NO_COPY_AVAILABLE', message: 'Sem Cópia' } }),
    })

    const erro = await request('/reservations').catch((e: unknown) => e)

    expect(isApiRequestError(erro)).toBe(true)
    if (isApiRequestError(erro)) {
      expect(erro.code).toBe('NO_COPY_AVAILABLE')
      expect(erro.message).toBe('Sem Cópia')
      expect(erro.status).toBe(409)
    }
  })

  it('cai em UNKNOWN_ERROR quando o corpo de erro não é JSON', async () => {
    stubFetch({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('not json')),
    })

    const erro = await request('/books').catch((e: unknown) => e)

    expect(isApiRequestError(erro)).toBe(true)
    if (isApiRequestError(erro)) {
      expect(erro.code).toBe('UNKNOWN_ERROR')
      expect(erro.message).toBe('HTTP 502')
    }
  })
})

describe('helpers de token e tipo', () => {
  it('setToken/clearToken giram o sessionStorage', () => {
    setToken('abc')
    expect(sessionStorage.getItem('access_token')).toBe('abc')

    clearToken()
    expect(sessionStorage.getItem('access_token')).toBeNull()
  })

  it('makeApiRequestError monta o objeto tipado', () => {
    const err = makeApiRequestError('VALIDATION_ERROR', 'inválido', 422)
    expect(err).toEqual({
      name: 'ApiRequestError',
      code: 'VALIDATION_ERROR',
      message: 'inválido',
      status: 422,
    })
  })

  it('isApiRequestError rejeita o que não é ApiRequestError', () => {
    expect(isApiRequestError(null)).toBe(false)
    expect(isApiRequestError(new Error('x'))).toBe(false)
    expect(isApiRequestError(makeApiRequestError('X', 'x', 400))).toBe(true)
  })
})
