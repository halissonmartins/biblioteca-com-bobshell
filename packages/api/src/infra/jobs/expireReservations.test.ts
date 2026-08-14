/**
 * packages/api/src/infra/jobs/expireReservations.test.ts
 * Testes unitários do job de expiração de Reservas — sem banco real.
 *
 * Cobre:
 *   - Execução imediata ao iniciar o job (expirar reservas de downtime)
 *   - Execução periódica a cada intervalo
 *   - Log apenas quando há reservas expiradas
 *   - Nenhum log quando não há reservas para expirar
 *   - Erro no banco não mata o processo (resiliência)
 *   - stop() cancela o intervalo (graceful shutdown)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startExpireReservationsJob,
  DEFAULT_INTERVAL_MS,
} from './expireReservations.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExpireFn(count = 0): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(count);
}

/** Avança os timers e drena a fila de microtasks para que as Promises resolvam */
async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('startExpireReservationsJob()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executa imediatamente ao iniciar (reservas que venceram durante downtime)', async () => {
    const expireReservationsTx = makeExpireFn(0);

    const job = startExpireReservationsJob({ expireReservationsTx });

    // Drena microtasks para resolver a Promise imediata sem avançar o timer
    await tick(0);

    expect(expireReservationsTx).toHaveBeenCalledTimes(1);

    job.stop();
  });

  it('executa novamente a cada intervalo', async () => {
    const expireReservationsTx = makeExpireFn(0);

    const job = startExpireReservationsJob({ expireReservationsTx }, 1_000);

    await tick(0); // execução imediata

    // Avança 3 intervalos
    await tick(3_000);

    // 1 imediata + 3 por intervalo
    expect(expireReservationsTx).toHaveBeenCalledTimes(4);

    job.stop();
  });

  it('registra log quando há reservas expiradas', async () => {
    const expireReservationsTx = makeExpireFn(5);
    const log = vi.fn();

    const job = startExpireReservationsJob({ expireReservationsTx, log });

    await tick(0);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('5 reserva(s) expirada(s)'));

    job.stop();
  });

  it('não registra log quando não há reservas para expirar', async () => {
    const expireReservationsTx = makeExpireFn(0);
    const log = vi.fn();

    const job = startExpireReservationsJob({ expireReservationsTx, log });

    await tick(0);

    expect(log).not.toHaveBeenCalled();

    job.stop();
  });

  it('passa um Date como parâmetro para expireReservationsTx', async () => {
    const expireReservationsTx = makeExpireFn(0);

    const job = startExpireReservationsJob({ expireReservationsTx });

    await tick(0);

    expect(expireReservationsTx).toHaveBeenCalledWith(expect.any(Date));

    job.stop();
  });

  it('não lança exceção quando expireReservationsTx falha (resiliência)', async () => {
    const expireReservationsTx = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    const job = startExpireReservationsJob({ expireReservationsTx }, 1_000);

    // Drena microtasks — execução imediata deve ser capturada pelo catch
    await expect(tick(0)).resolves.toBeUndefined();

    job.stop();
  });

  it('stop() cancela o intervalo — sem mais execuções após parar', async () => {
    const expireReservationsTx = makeExpireFn(0);

    const job = startExpireReservationsJob({ expireReservationsTx }, 1_000);

    await tick(0); // execução imediata
    job.stop();

    const countAfterStop = expireReservationsTx.mock.calls.length;

    // Avança mais 5 intervalos após o stop
    await tick(5_000);

    expect(expireReservationsTx).toHaveBeenCalledTimes(countAfterStop);
  });

  it('DEFAULT_INTERVAL_MS é 60 000 ms (1 minuto)', () => {
    expect(DEFAULT_INTERVAL_MS).toBe(60_000);
  });
});
