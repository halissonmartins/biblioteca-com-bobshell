/**
 * packages/api/src/domain/reservation/reservationService.test.ts
 * Testes unitários do reservationService — sem banco real (deps injetados como stubs).
 *
 * Cobre:
 *   - createReservation: sucesso, sem cópia disponível (RN-3), expiração em 12h (RN-1)
 *   - listReaderReservations: delega ao repositório corretamente (RF-L4)
 *   - listBookReservations: delega ao repositório corretamente (RF-B1)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createReservation,
  listReaderReservations,
  listBookReservations,
  type ReservationServiceDeps,
} from './reservationService.js';
import { AppError } from '../../shared/errors.js';
import type {
  ReservationSummary,
  ReservationDetail,
} from './reservationTypes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-08-14T10:00:00.000Z');
const EXPECTED_EXPIRES_AT = new Date('2026-08-14T22:00:00.000Z');

const AVAILABLE_COPY = { id: 'copy-1', code: 'LIV-001' };

function makeReservationSummary(overrides?: Partial<ReservationSummary>): ReservationSummary {
  return {
    id: 'res-1',
    expiresAt: EXPECTED_EXPIRES_AT.toISOString(),
    createdAt: FIXED_NOW.toISOString(),
    copy: {
      id: 'copy-1',
      code: 'LIV-001',
      book: {
        id: 'book-1',
        title: 'Dom Casmurro',
        coverUrl: null,
      },
    },
    ...overrides,
  };
}

function makeReservationDetail(overrides?: Partial<ReservationDetail>): ReservationDetail {
  return {
    ...makeReservationSummary(),
    reader: { id: 'user-1', name: 'João Leitor', email: 'joao@example.com' },
    status: 'active',
    convertedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ReservationServiceDeps>): ReservationServiceDeps {
  return {
    findAvailableCopy: vi.fn().mockResolvedValue(AVAILABLE_COPY),
    createReservationTx: vi.fn().mockResolvedValue({ reservationId: 'res-1' }),
    findActiveReservationsByUser: vi.fn().mockResolvedValue([]),
    findReservationsByBook: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createReservation()
// ---------------------------------------------------------------------------

describe('createReservation()', () => {
  it('cria Reserva com sucesso quando há Cópia disponível', async () => {
    const deps = makeDeps();

    const result = await createReservation(
      { userId: 'user-1', bookId: 'book-1' },
      deps,
      FIXED_NOW,
    );

    expect(result.reservationId).toBe('res-1');
    expect(result.copyId).toBe('copy-1');
    expect(result.expiresAt).toBe(EXPECTED_EXPIRES_AT.toISOString());
  });

  it('consulta Cópia disponível pelo bookId correto (RN-3)', async () => {
    const deps = makeDeps();

    await createReservation({ userId: 'user-1', bookId: 'book-42' }, deps, FIXED_NOW);

    expect(deps.findAvailableCopy).toHaveBeenCalledWith('book-42');
  });

  it('lança NO_COPY_AVAILABLE quando não há Cópia disponível (RN-3)', async () => {
    const deps = makeDeps({
      findAvailableCopy: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createReservation({ userId: 'user-1', bookId: 'book-1' }, deps, FIXED_NOW),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      createReservation({ userId: 'user-1', bookId: 'book-1' }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'NO_COPY_AVAILABLE' });
  });

  it('define expiresAt exatamente 12 horas após now (RN-1)', async () => {
    const deps = makeDeps();

    const result = await createReservation(
      { userId: 'user-1', bookId: 'book-1' },
      deps,
      FIXED_NOW,
    );

    const expiresAt = new Date(result.expiresAt);
    const diffMs = expiresAt.getTime() - FIXED_NOW.getTime();
    expect(diffMs).toBe(12 * 60 * 60 * 1_000);
  });

  it('passa userId, copyId e expiresAt corretos para createReservationTx (RN-4)', async () => {
    const deps = makeDeps();

    await createReservation({ userId: 'user-99', bookId: 'book-1' }, deps, FIXED_NOW);

    expect(deps.createReservationTx).toHaveBeenCalledWith({
      userId: 'user-99',
      copyId: 'copy-1',
      expiresAt: EXPECTED_EXPIRES_AT,
    });
  });

  it('não chama createReservationTx se não há Cópia disponível', async () => {
    const deps = makeDeps({
      findAvailableCopy: vi.fn().mockResolvedValue(null),
    });

    await createReservation({ userId: 'user-1', bookId: 'book-1' }, deps, FIXED_NOW).catch(
      () => undefined,
    );

    expect(deps.createReservationTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listReaderReservations()
// ---------------------------------------------------------------------------

describe('listReaderReservations()', () => {
  it('retorna lista de Reservas ativas do Leitor (RF-L4)', async () => {
    const reservations = [makeReservationSummary()];
    const deps = makeDeps({
      findActiveReservationsByUser: vi.fn().mockResolvedValue(reservations),
    });

    const result = await listReaderReservations({ userId: 'user-1' }, deps);

    expect(result).toEqual(reservations);
    expect(deps.findActiveReservationsByUser).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('retorna lista vazia quando o Leitor não tem Reservas ativas', async () => {
    const deps = makeDeps({
      findActiveReservationsByUser: vi.fn().mockResolvedValue([]),
    });

    const result = await listReaderReservations({ userId: 'user-sem-reservas' }, deps);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listBookReservations()
// ---------------------------------------------------------------------------

describe('listBookReservations()', () => {
  it('retorna todas as Reservas de um Livro (RF-B1)', async () => {
    const details = [
      makeReservationDetail({ status: 'active' }),
      makeReservationDetail({ id: 'res-2', status: 'expired' }),
    ];
    const deps = makeDeps({
      findReservationsByBook: vi.fn().mockResolvedValue(details),
    });

    const result = await listBookReservations({ bookId: 'book-1' }, deps);

    expect(result).toEqual(details);
    expect(deps.findReservationsByBook).toHaveBeenCalledWith({ bookId: 'book-1' });
  });

  it('retorna lista vazia quando o Livro não tem Reservas', async () => {
    const deps = makeDeps({
      findReservationsByBook: vi.fn().mockResolvedValue([]),
    });

    const result = await listBookReservations({ bookId: 'book-sem-reservas' }, deps);

    expect(result).toEqual([]);
  });

  it('inclui dados do Leitor em cada Reserva (RF-B1)', async () => {
    const detail = makeReservationDetail({
      reader: { id: 'user-2', name: 'Maria Leitora', email: 'maria@example.com' },
    });
    const deps = makeDeps({
      findReservationsByBook: vi.fn().mockResolvedValue([detail]),
    });

    const [reservation] = await listBookReservations({ bookId: 'book-1' }, deps);

    expect(reservation?.reader.name).toBe('Maria Leitora');
    expect(reservation?.reader.email).toBe('maria@example.com');
  });

  it('retorna Reservas com status derivado correto', async () => {
    const details = [
      makeReservationDetail({ status: 'active' }),
      makeReservationDetail({ id: 'res-2', status: 'expired' }),
      makeReservationDetail({ id: 'res-3', status: 'converted', convertedAt: FIXED_NOW.toISOString() }),
    ];
    const deps = makeDeps({
      findReservationsByBook: vi.fn().mockResolvedValue(details),
    });

    const result = await listBookReservations({ bookId: 'book-1' }, deps);

    expect(result[0]?.status).toBe('active');
    expect(result[1]?.status).toBe('expired');
    expect(result[2]?.status).toBe('converted');
    expect(result[2]?.convertedAt).toBe(FIXED_NOW.toISOString());
  });
});
