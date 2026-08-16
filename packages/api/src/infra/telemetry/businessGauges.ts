/**
 * packages/api/src/infra/telemetry/businessGauges.ts
 * Gauges observáveis do estado do acervo.
 *
 * ⚠️ Registrados APENAS pelo processo servidor (src/index.ts). Cada coleta
 * consulta o banco, então este módulo nunca deve ser importado por app.ts nem
 * pelos testes. (Sem SDK, `addBatchObservableCallback` é no-op e o callback
 * nunca roda — mas a regra continua valendo por clareza.)
 */

import type { BatchObservableResult } from '@opentelemetry/api';

import { logger } from '../../shared/logger.js';
import { lerRetratoDoAcervo } from '../repositories/statsRepository.js';
import type { RetratoDoAcervo } from '../repositories/statsRepository.js';
import { meter } from './metrics.js';

const reservasAtivas = meter.createObservableGauge('biblioteca.reservas.ativas', {
  description: 'Reservas ativas neste instante (RN-1)',
  unit: '{reserva}',
});

const emprestimosAtivos = meter.createObservableGauge('biblioteca.emprestimos.ativos', {
  description: 'Empréstimos em aberto',
  unit: '{emprestimo}',
});

const emprestimosVencidos = meter.createObservableGauge('biblioteca.emprestimos.vencidos', {
  description: 'Empréstimos em aberto com vencimento no passado (RN-8)',
  unit: '{emprestimo}',
});

/** Atributo `status`: available | reserved | loaned — a Disponibilidade do acervo. */
const copias = meter.createObservableGauge('biblioteca.copias', {
  description: 'Cópias do acervo por status',
  unit: '{copia}',
});

const TTL_MS = Number(process.env['BUSINESS_GAUGES_TTL_MS'] ?? 60_000);

let cache: RetratoDoAcervo | undefined;
let cacheEm = 0;

/**
 * Amortece o custo: o reader coleta a cada OTEL_METRIC_EXPORT_INTERVAL (15 s),
 * mas o banco é consultado no máximo uma vez por TTL_MS (60 s).
 */
async function retrato(): Promise<RetratoDoAcervo> {
  const agora = Date.now();
  if (cache !== undefined && agora - cacheEm < TTL_MS) return cache;
  cache = await lerRetratoDoAcervo(new Date(agora));
  cacheEm = agora;
  return cache;
}

export function registrarGaugesDeNegocio(): void {
  if (process.env['BUSINESS_GAUGES_ENABLED'] === 'false') return;

  // Um único callback em lote para os quatro gauges: uma rodada de queries por
  // coleta, em vez de quatro.
  meter.addBatchObservableCallback(
    async (resultado: BatchObservableResult): Promise<void> => {
      try {
        const dados = await retrato();
        resultado.observe(reservasAtivas, dados.reservasAtivas);
        resultado.observe(emprestimosAtivos, dados.emprestimosAtivos);
        resultado.observe(emprestimosVencidos, dados.emprestimosVencidos);
        for (const copia of dados.copias) {
          resultado.observe(copias, copia.total, { status: copia.status });
        }
      } catch (err) {
        // Uma coleta que falha nunca pode derrubar o processo nem impedir o
        // export das demais métricas.
        logger.warn({ err }, 'falha ao coletar gauges de negócio');
      }
    },
    [reservasAtivas, emprestimosAtivos, emprestimosVencidos, copias],
  );
}
