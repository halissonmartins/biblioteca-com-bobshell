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
