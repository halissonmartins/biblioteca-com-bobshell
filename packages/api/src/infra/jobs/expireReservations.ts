/**
 * packages/api/src/infra/jobs/expireReservations.ts
 * Job de expiração periódica de Reservas — RN-1, RN-5.
 *
 * Responsabilidade única: a cada intervalo, localizar Reservas expiradas
 * e liberar as Cópias de volta ao acervo disponível em uma transação atômica.
 *
 * Design:
 *   - Sem biblioteca de cron externo; usa setInterval nativo (simplicidade v1)
 *   - Recebe `expireReservationsFn` como dependência → testável sem banco real
 *   - Retorna `stop()` para graceful shutdown no process.on('SIGTERM')
 *
 * Invariante arquitetural: este arquivo fica em infra/ — não contém regra de negócio.
 * A regra de que "reservas expiram em 12h" (RN-1) está na criação (reservationService).
 * Este job apenas executa o efeito colateral de expirar o que já venceu.
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';

import { logger } from '../../shared/logger.js';
import { jobDuracao, jobExecucoes, reservasExpiradas } from '../telemetry/metrics.js';

const tracer = trace.getTracer('biblioteca.jobs');
const ATRIBUTOS_JOB = { nome_job: 'expirar_reservas' };

/** Intervalo padrão entre execuções: 1 minuto */
export const DEFAULT_INTERVAL_MS = 60 * 1_000;

export interface ExpireJobDeps {
  /**
   * Função que efetua a expiração em lote no banco.
   * Retorna o número de Reservas expiradas.
   */
  expireReservationsTx: (now: Date) => Promise<number>;

  /** Injetável em testes para observar log sem poluir stdout */
  log?: (message: string) => void;
}

export interface ReservationExpiryJob {
  /** Para o job e libera o intervalo (graceful shutdown) */
  stop: () => void;
}

/**
 * Inicia o job de expiração de Reservas.
 *
 * @param deps      - dependências injetadas (repositório + log opcional)
 * @param intervalMs - intervalo de verificação em ms (default: 60 000)
 * @returns objeto com `stop()` para cancelar o job
 */
export function startExpireReservationsJob(
  deps: ExpireJobDeps,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): ReservationExpiryJob {
  const {
    expireReservationsTx,
    log = (message: string): void => {
      logger.info(message);
    },
  } = deps;

  async function run(): Promise<void> {
    const now = new Date();
    const inicio = performance.now();

    // Cada execução vira um trace raiz, com os spans do Prisma como filhos.
    await tracer.startActiveSpan('job.expirar_reservas', async (span) => {
      try {
        const count = await expireReservationsTx(now);
        span.setAttribute('biblioteca.reservas.expiradas', count);
        if (count > 0) {
          reservasExpiradas.add(count);
          log(
            `[expireReservations] ${String(count)} reserva(s) expirada(s) em ${now.toISOString()}`,
          );
        }
        jobExecucoes.add(1, { ...ATRIBUTOS_JOB, resultado: 'sucesso' });
      } catch (err) {
        // Erro não deve matar o processo — apenas logar e aguardar próxima execução
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        jobExecucoes.add(1, { ...ATRIBUTOS_JOB, resultado: 'erro' });
        logger.error({ err }, '[expireReservations] Erro ao expirar reservas');
      } finally {
        jobDuracao.record((performance.now() - inicio) / 1000, ATRIBUTOS_JOB);
        span.end();
      }
    });
  }

  const timer = setInterval(() => {
    void run(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }, intervalMs);

  // Executa imediatamente na inicialização para expirar Reservas que venceram
  // enquanto o servidor estava offline (janela de downtime)
  void run();

  return {
    stop: (): void => { clearInterval(timer); },
  };
}
