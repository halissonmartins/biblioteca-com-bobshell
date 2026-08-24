/**
 * Testes dos módulos de endpoint da SPA — wrappers finos sobre request().
 * Um teste por função: o que importa é a URL, o método e a extração de `data`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAuthor } from './authors'
import { getBook, listBooks } from './books'
import { createLoan, getAllLoans, getMyLoans, returnLoan } from './loans'
import { getMe } from './me'
import {
  createReservation,
  getAllReservations,
  getBookReservations,
  getMyReservations,
} from './reservations'

interface Chamada {
  url: string
  init: RequestInit
}

function stubFetch(payload: unknown): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      chamadas.push({ url: String(url), init })
      return { ok: true, status: 200, json: async () => payload }
    }),
  )
  return chamadas
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authors', () => {
  it('getAuthor extrai data do envelope', async () => {
    const autor = { id: 'a1', name: 'Machado de Assis', slug: 'machado', books: [] }
    const chamadas = stubFetch({ ok: true, data: autor })

    const resultado = await getAuthor('machado')

    expect(resultado).toEqual(autor)
    expect(chamadas[0]?.url).toBe('/api/authors/machado')
  })
})

describe('books', () => {
  it('listBooks serializa os filtros como query string', async () => {
    const paginado = { items: [], page: 2, pageSize: 20, total: 0 }
    const chamadas = stubFetch({ ok: true, data: paginado })

    const resultado = await listBooks({ search: 'machado', genre: 'Romance', page: 2, pageSize: 20 })

    expect(resultado).toEqual(paginado)
    expect(chamadas[0]?.url).toBe('/api/books?search=machado&genre=Romance&page=2&pageSize=20')
  })

  it('listBooks sem filtros não adiciona query string', async () => {
    const chamadas = stubFetch({ ok: true, data: { items: [] } })

    await listBooks()

    expect(chamadas[0]?.url).toBe('/api/books')
  })

  it('getBook extrai data do envelope', async () => {
    const livro = { id: 'b1', title: 'Dom Casmurro' }
    const chamadas = stubFetch({ ok: true, data: livro })

    const resultado = await getBook('b1')

    expect(resultado).toEqual(livro)
    expect(chamadas[0]?.url).toBe('/api/books/b1')
  })
})

describe('loans', () => {
  it('createLoan faz POST com corpo JSON e devolve o Empréstimo', async () => {
    const emprestimo = { id: 'l1', dueAt: '2026-08-30T23:59:59Z' }
    const chamadas = stubFetch({ ok: true, data: { loan: emprestimo } })

    const resultado = await createLoan({ reservationId: 'r1', dueAt: '2026-08-30T23:59:59Z' })

    expect(resultado).toEqual(emprestimo)
    expect(chamadas[0]?.url).toBe('/api/loans')
    expect(chamadas[0]?.init.method).toBe('POST')
    expect(chamadas[0]?.init.body).toBe(
      JSON.stringify({ reservationId: 'r1', dueAt: '2026-08-30T23:59:59Z' }),
    )
  })

  it('returnLoan faz PATCH no caminho de devolução', async () => {
    const devolvido = { id: 'l1', returnedAt: '2026-08-24T12:00:00Z' }
    const chamadas = stubFetch({ ok: true, data: { loan: devolvido } })

    const resultado = await returnLoan('l1')

    expect(resultado).toEqual(devolvido)
    expect(chamadas[0]?.url).toBe('/api/loans/l1/return')
    expect(chamadas[0]?.init.method).toBe('PATCH')
  })

  it('getMyLoans devolve a lista do Leitor', async () => {
    const lista = [{ id: 'l1' }]
    const chamadas = stubFetch({ ok: true, data: lista })

    const resultado = await getMyLoans()

    expect(resultado).toEqual(lista)
    expect(chamadas[0]?.url).toBe('/api/me/loans')
  })

  it('getAllLoans filtra por usuário quando recebe um id', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getAllLoans('u 7')

    expect(chamadas[0]?.url).toBe(`/api/loans?userId=${encodeURIComponent('u 7')}`)
  })

  it('getAllLoans sem filtro lista tudo', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getAllLoans()

    expect(chamadas[0]?.url).toBe('/api/loans')
  })
})

describe('me', () => {
  it('getMe devolve o perfil local autenticado', async () => {
    const usuario = { id: 'u1', name: 'Ana', role: 'leitor' }
    const chamadas = stubFetch({ ok: true, data: usuario })

    const resultado = await getMe()

    expect(resultado).toEqual(usuario)
    expect(chamadas[0]?.url).toBe('/api/me')
  })
})

describe('reservations', () => {
  it('createReservation faz POST e devolve a Reserva criada', async () => {
    const reserva = { id: 'r1', status: 'active' }
    const chamadas = stubFetch({ ok: true, data: { reservation: reserva } })

    const resultado = await createReservation({ bookId: 'b1' })

    expect(resultado).toEqual(reserva)
    expect(chamadas[0]?.url).toBe('/api/reservations')
    expect(chamadas[0]?.init.method).toBe('POST')
  })

  it('getMyReservations lista as Reservas ativas do Leitor', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getMyReservations()

    expect(chamadas[0]?.url).toBe('/api/me/reservations')
  })

  it('getBookReservations consulta por Livro', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getBookReservations('b1')

    expect(chamadas[0]?.url).toBe('/api/books/b1/reservations')
  })

  it('getAllReservations filtra por usuário quando recebe um id', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getAllReservations('u1')

    expect(chamadas[0]?.url).toBe('/api/reservations?userId=u1')
  })

  it('getAllReservations sem filtro lista tudo', async () => {
    const chamadas = stubFetch({ ok: true, data: [] })

    await getAllReservations()

    expect(chamadas[0]?.url).toBe('/api/reservations')
  })
})
