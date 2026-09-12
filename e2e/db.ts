/**
 * Acesso direto ao banco a partir do E2E — só para manipular o relógio dos dados.
 *
 * Regras de negócio com prazo (RN-1: 12h; RN-6: só Reserva ativa vira Empréstimo)
 * são inobserváveis pela API sozinha: não há endpoint que envelheça uma Reserva, e
 * esperar 12 horas não é um teste. Adiantar `expiresAt` na tabela é a única forma
 * de ver o sistema real reagir ao vencimento — o resto do caminho (job, API, tela)
 * continua sendo o de produção.
 *
 * Usa o Prisma Client já gerado em packages/api: mesma DATABASE_URL do global-setup,
 * sem duplicar dependência nem schema neste pacote. Cada chamada abre e fecha sua
 * própria conexão — são poucas, e assim nenhum handle fica pendurado no worker.
 */

import { PrismaClient } from '../packages/api/node_modules/@prisma/client'

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://biblioteca:biblioteca@localhost:5432/biblioteca'

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
  try {
    return await fn(db)
  } finally {
    await db.$disconnect()
  }
}

/** Move o vencimento de uma Reserva para `ms` a partir de agora (negativo = passado). */
export async function setReservationExpiry(reservationId: string, ms: number): Promise<Date> {
  const expiresAt = new Date(Date.now() + ms)
  await withDb((db) =>
    db.reservation.update({ where: { id: reservationId }, data: { expiresAt } }),
  )
  return expiresAt
}

/** Vence uma Reserva agora — o prazo passou há um minuto (RN-1). */
export async function expireReservation(reservationId: string): Promise<void> {
  await setReservationExpiry(reservationId, -60_000)
}

/**
 * Vence todas as Reservas ainda ativas de um Leitor.
 * Cenário "todas as minhas Reservas expiraram" de US-04.
 */
export async function expireAllReservationsOf(userId: string): Promise<number> {
  return withDb(async (db) => {
    const { count } = await db.reservation.updateMany({
      where: { userId, convertedAt: null, cancelledAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    return count
  })
}

/**
 * Deixa a Reserva no estado em que o job de expiração a deixa: prazo vencido e
 * `cancelledAt` preenchido (RN-1). Serve para verificar a resposta da API *depois*
 * de o job passar, sem esperar o próximo tique — a liberação da Cópia, que é o outro
 * efeito do job, é observada de verdade em `regras-negocio-api.spec.ts`.
 */
export async function expireReservationAsJobWould(reservationId: string): Promise<void> {
  const agora = new Date()
  await withDb((db) =>
    db.reservation.update({
      where: { id: reservationId },
      data: { expiresAt: new Date(agora.getTime() - 60_000), cancelledAt: agora },
    }),
  )
}

/**
 * Libera uma Reserva ativa agora: cancela e devolve a Cópia ao acervo na mesma
 * transação — exatamente o que `expireReservationsTx` faz quando o job passa,
 * sem esperar o próximo tique de um minuto.
 *
 * Existe por causa de RN-9 e RN-10, que fizeram da Reserva um recurso do Leitor:
 * um cenário que termina segurando Reserva gasta uma das três vagas do seu
 * Leitor e bloqueia aquele Livro para ele — inclusive na repetição do próprio
 * cenário, quando o Playwright repete um teste que falhou. Cenário que consome
 * Cópia e não precisa do estado depois desfaz o que fez aqui.
 *
 * Só para Reserva ainda ativa: uma já convertida em Empréstimo se desfaz pela
 * Devolução (`PATCH /loans/:id/return`), que é caminho de produção.
 */
export async function releaseReservation(reservationId: string): Promise<void> {
  await withDb((db) =>
    db.$transaction(async (tx) => {
      const { copyId } = await tx.reservation.update({
        where: { id: reservationId },
        data: { cancelledAt: new Date() },
        select: { copyId: true },
      })
      await tx.copy.updateMany({
        where: { id: copyId, status: 'reserved' },
        data: { status: 'available' },
      })
    }),
  )
}

/** Status atual de uma Cópia — 'available' | 'reserved' | 'loaned' (glossario.md). */
export async function copyStatus(copyId: string): Promise<string> {
  return withDb(async (db) => {
    const copy = await db.copy.findUniqueOrThrow({
      where: { id: copyId },
      select: { status: true },
    })
    return copy.status
  })
}

/** Quantas Reservas existem para uma Cópia (ativas ou não) — detecta reserva dupla. */
export async function countReservationsForCopy(copyId: string): Promise<number> {
  return withDb((db) => db.reservation.count({ where: { copyId } }))
}

/** Quantos Empréstimos saíram de uma Reserva — detecta conversão dupla (RN-6). */
export async function countLoansForReservation(reservationId: string): Promise<number> {
  return withDb((db) => db.loan.count({ where: { reservationId } }))
}
