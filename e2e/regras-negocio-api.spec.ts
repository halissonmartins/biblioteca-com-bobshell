import { test, expect } from '@playwright/test'
import {
  API,
  apiBookByTitle,
  apiCreateReservation,
  apiGetBook,
  apiErrorOf,
  bearer,
  newActor,
  LEITOR,
  LEITOR_2,
} from './helpers'
import { copyStatus, countReservationsForCopy, expireReservation } from './db'

/**
 * Regras que só existem no tempo e na concorrência.
 *
 * Nenhuma delas cabe na UI: o navegador não emite duas requisições no mesmo
 * instante e não sabe esperar doze horas. São as duas propriedades de US-03 que
 * ficaram sem teste desde o começo — a última Cópia disputada e o prazo que vence
 * sozinho — e ambas são observadas aqui no sistema real, com o job de expiração
 * de produção rodando no processo da API.
 */
test.describe('Regras de negócio no sistema real (RN-1, RN-3, RN-5)', () => {
  test('US-03 — a última Cópia é de um Leitor só, ainda que todos peçam ao mesmo tempo', async ({ playwright }) => {
    const ana = await newActor(playwright, LEITOR.email)

    const livro = await apiBookByTitle(ana.ctx, 'O Nome de Deus')
    expect(livro.availableCopies, 'o cenário exige um Livro com 2 Cópias livres').toBe(2)

    // Ana fica com a primeira Cópia — é a Reserva que não pode ser afetada por nada
    // do que vier depois.
    const reservaDaAna = await apiCreateReservation(ana.ctx, ana.token, livro.id)
    expect((await apiGetBook(ana.ctx, livro.id)).availableCopies).toBe(1)

    // Oito tentativas sobre a última Cópia, disparadas juntas. Cada uma vai num
    // contexto HTTP próprio de propósito: um APIRequestContext reaproveita a mesma
    // conexão e enfileira as requisições, o que faria o teste passar por serialização
    // acidental em vez de por correção. Sem o UPDATE condicional na transação, todas
    // encontram a mesma Cópia livre em findAvailableCopy e todas gravam.
    const disputantes = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        newActor(playwright, i % 2 === 0 ? LEITOR.email : LEITOR_2.email),
      ),
    )

    const respostas = await Promise.all(
      disputantes.map((actor) =>
        actor.ctx.post(`${API}/reservations`, {
          headers: bearer(actor.token),
          data: { bookId: livro.id },
        }),
      ),
    )
    const status = respostas.map((r) => r.status())

    expect(status.filter((s) => s === 201), `status recebidos: ${status.join(',')}`).toHaveLength(1)
    expect(status.filter((s) => s === 409)).toHaveLength(7)

    // Quem perdeu recebe a mesma resposta de quem tenta reservar Livro esgotado
    for (const recusada of respostas.filter((r) => r.status() === 409)) {
      expect((await apiErrorOf(recusada)).code).toBe('NO_COPY_AVAILABLE')
    }

    // O acervo não ficou devendo nem sobrando Cópia
    expect((await apiGetBook(ana.ctx, livro.id)).availableCopies).toBe(0)

    // A Cópia vencedora tem exatamente uma Reserva — reserva dupla é invisível pela
    // API (Disponibilidade continua 0) e só aparece olhando a tabela.
    const vencedora = (await respostas.find((r) => r.status() === 201)!.json()).data.reservation
    expect(await countReservationsForCopy(vencedora.copy.id)).toBe(1)
    expect(await copyStatus(vencedora.copy.id)).toBe('reserved')

    // "E minha Reserva não é afetada"
    expect(await countReservationsForCopy(reservaDaAna.copy.id)).toBe(1)
    expect(await copyStatus(reservaDaAna.copy.id)).toBe('reserved')

    await Promise.all(disputantes.map((actor) => actor.dispose()))
    await ana.dispose()
  })

  test('RN-1/RN-5 — Reserva vencida sai da lista do Leitor e a Cópia volta ao acervo', async ({ playwright }) => {
    // O job de expiração roda a cada minuto no processo da API (index.ts). Este é o
    // único teste que espera por ele: nada mais no sistema devolve a Cópia ao acervo,
    // e o teste unitário do job não vê a Disponibilidade subir de novo.
    test.setTimeout(150_000)

    const ana = await newActor(playwright, LEITOR.email)
    const livro = await apiBookByTitle(ana.ctx, 'A Paixão Segundo G.H.')
    const disponiveisAntes = livro.availableCopies
    expect(disponiveisAntes).toBeGreaterThan(0)

    const reserva = await apiCreateReservation(ana.ctx, ana.token, livro.id)
    expect((await apiGetBook(ana.ctx, livro.id)).availableCopies).toBe(disponiveisAntes - 1)
    expect(await copyStatus(reserva.copy.id)).toBe('reserved')

    const minhasReservas = async (): Promise<string[]> => {
      const res = await ana.ctx.get(`${API}/me/reservations`, { headers: bearer(ana.token) })
      expect(res.status()).toBe(200)
      return ((await res.json()).data as Array<{ id: string }>).map((r) => r.id)
    }
    expect(await minhasReservas()).toContain(reserva.id)

    // Adianta o relógio da Reserva: o prazo de 12h passou
    await expireReservation(reserva.id)

    // A lista do Leitor é filtrada por prazo na leitura — some na hora, sem depender
    // do job (RF-L4)
    expect(await minhasReservas()).not.toContain(reserva.id)

    // A Cópia, essa, só volta quando o job passa (RN-5)
    await expect
      .poll(async () => (await apiGetBook(ana.ctx, livro.id)).availableCopies, {
        timeout: 120_000,
        intervals: [1_000, 2_000, 5_000],
        message: 'o job de expiração deveria devolver a Cópia ao acervo',
      })
      .toBe(disponiveisAntes)

    expect(await copyStatus(reserva.copy.id)).toBe('available')

    // E ela volta reservável de verdade — não é só a contagem que subiu
    const denovo = await apiCreateReservation(ana.ctx, ana.token, livro.id)
    expect(denovo.id).not.toBe(reserva.id)

    await ana.dispose()
  })
})
