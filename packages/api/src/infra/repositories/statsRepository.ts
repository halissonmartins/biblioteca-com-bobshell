/**
 * packages/api/src/infra/repositories/statsRepository.ts
 * Contagens agregadas para os gauges de estado da observabilidade.
 * Somente leitura, sem regra de negócio.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente —
 * por isso os callbacks dos gauges (infra/telemetry/businessGauges.ts) passam
 * por aqui em vez de falar com o Prisma.
 */

import type { CopyStatus } from '@prisma/client';

import { prisma } from '../prisma.js';

export interface RetratoDoAcervo {
  reservasAtivas: number;
  emprestimosAtivos: number;
  emprestimosVencidos: number;
  copias: { status: CopyStatus; total: number }[];
}

/**
 * Uma única rodada de agregações para todos os gauges.
 *
 * Custo: as três contagens usam índice (`@@index([expiresAt])` e
 * `@@index([dueAt])`). O `groupBy` por status das Cópias é um agregado só,
 * em vez de três `count` — mas ainda varre a tabela, que chega a ~500k linhas
 * com o seed de performance. Por isso o chamador aplica cache (ver
 * businessGauges.ts) e há a chave BUSINESS_GAUGES_ENABLED para desligar
 * durante testes de carga.
 */
export async function lerRetratoDoAcervo(agora: Date): Promise<RetratoDoAcervo> {
  const [reservasAtivas, emprestimosAtivos, emprestimosVencidos, copias] = await Promise.all([
    // Reserva ativa = dentro das 12 h (RN-1), não convertida e não expirada.
    // Glossário: a expiração é registrada em `cancelledAt`.
    prisma.reservation.count({
      where: { expiresAt: { gt: agora }, convertedAt: null, cancelledAt: null },
    }),
    prisma.loan.count({ where: { returnedAt: null } }),
    prisma.loan.count({ where: { returnedAt: null, dueAt: { lt: agora } } }),
    prisma.copy.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return {
    reservasAtivas,
    emprestimosAtivos,
    emprestimosVencidos,
    copias: copias.map((linha) => ({ status: linha.status, total: linha._count._all })),
  };
}
