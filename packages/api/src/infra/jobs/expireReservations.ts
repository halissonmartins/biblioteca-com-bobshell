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
  const { expireReservationsTx, log = console.info } = deps;

  async function run(): Promise<void> {
    const now = new Date();
    try {
      const count = await expireReservationsTx(now);
      if (count > 0) {
        log(`[expireReservations] ${String(count)} reserva(s) expirada(s) em ${now.toISOString()}`);
      }
    } catch (err) {
      // Erro não deve matar o processo — apenas logar e aguardar próxima execução
      console.error('[expireReservations] Erro ao expirar reservas:', err);
    }
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
