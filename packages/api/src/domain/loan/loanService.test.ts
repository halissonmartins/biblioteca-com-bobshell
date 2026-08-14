/**
 * packages/api/src/domain/loan/loanService.test.ts
 * Testes unitários do loanService — sem banco real (deps injetados como stubs).
 *
 * Cobre:
 *   - createLoan: sucesso, reserva não encontrada, já convertida, cancelada, expirada (RN-6)
 *   - returnLoan: sucesso, empréstimo não encontrado, já devolvido
 *   - listLoans: delegação correta ao repositório (RF-L5, RF-B2, RF-B3)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createLoan,
  returnLoan,
  listLoans,
  type LoanServiceDeps,
  type ReservationForLoan,
  type LoanForReturn,
} from './loanService.js';
import { AppError } from '../../shared/errors.js';
import type { LoanSummary } from './loanTypes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-08-14T10:00:00.000Z');
const FUTURE_DATE = new Date('2026-08-14T12:00:00.000Z');   // ainda não expirou
const PAST_DATE   = new Date('2026-08-14T08:00:00.000Z');   // já expirou antes de now
const DUE_AT      = new Date('2026-08-21T10:00:00.000Z');   // vencimento em 7 dias

function makeReservation(overrides?: Partial<ReservationForLoan>): ReservationForLoan {
  return {
    id: 'res-1',
    copyId: 'copy-1',
    userId: 'user-1',
    expiresAt: FUTURE_DATE,
    convertedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function makeLoan(overrides?: Partial<LoanForReturn>): LoanForReturn {
  return {
    id: 'loan-1',
    copyId: 'copy-1',
    returnedAt: null,
    ...overrides,
  };
}

function makeLoanSummary(overrides?: Partial<LoanSummary>): LoanSummary {
  return {
    id: 'loan-1',
    dueAt: DUE_AT.toISOString(),
    returnedAt: null,
    createdAt: FIXED_NOW.toISOString(),
    copy: {
      id: 'copy-1',
      code: 'LIV-001',
      book: { id: 'book-1', title: 'Dom Casmurro', coverUrl: null },
    },
    reader: { id: 'user-1', name: 'João Leitor', email: 'joao@example.com' },
    librarian: { id: 'lib-1', name: 'Ana Bibliotecária' },
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<LoanServiceDeps>): LoanServiceDeps {
  return {
    findReservationById: vi.fn().mockResolvedValue(makeReservation()),
    createLoanTx: vi.fn().mockResolvedValue({ loanId: 'loan-1' }),
    findLoanById: vi.fn().mockResolvedValue(makeLoan()),
    returnLoanTx: vi.fn().mockResolvedValue(undefined),
    findLoans: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createLoan()
// ---------------------------------------------------------------------------

describe('createLoan()', () => {
  it('efetiva Empréstimo com sucesso a partir de Reserva ativa (RF-B4)', async () => {
    const deps = makeDeps();

    const result = await createLoan(
      { reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT },
      deps,
      FIXED_NOW,
    );

    expect(result.loanId).toBe('loan-1');
    expect(result.copyId).toBe('copy-1');
    expect(result.dueAt).toBe(DUE_AT.toISOString());
  });

  it('busca a Reserva pelo reservationId informado (RN-6)', async () => {
    const deps = makeDeps();

    await createLoan(
      { reservationId: 'res-99', librarianId: 'lib-1', dueAt: DUE_AT },
      deps,
      FIXED_NOW,
    );

    expect(deps.findReservationById).toHaveBeenCalledWith('res-99');
  });

  it('lança NOT_FOUND quando a Reserva não existe', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createLoan({ reservationId: 'res-x', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      createLoan({ reservationId: 'res-x', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lança CONFLICT quando a Reserva já foi convertida (RN-6)', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(
        makeReservation({ convertedAt: PAST_DATE }),
      ),
    });

    await expect(
      createLoan({ reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lança CONFLICT quando a Reserva foi cancelada (RN-6)', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(
        makeReservation({ cancelledAt: PAST_DATE }),
      ),
    });

    await expect(
      createLoan({ reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lança RESERVATION_EXPIRED quando a Reserva está expirada (RN-6)', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(
        makeReservation({ expiresAt: PAST_DATE }),
      ),
    });

    await expect(
      createLoan({ reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      createLoan({ reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED' });
  });

  it('lança RESERVATION_EXPIRED quando expiresAt === now (fronteira inclusiva)', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(
        makeReservation({ expiresAt: FIXED_NOW }), // expiresAt <= now → expirada
      ),
    });

    await expect(
      createLoan({ reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED' });
  });

  it('passa todos os campos corretos para createLoanTx', async () => {
    const deps = makeDeps();

    await createLoan(
      { reservationId: 'res-1', librarianId: 'lib-42', dueAt: DUE_AT },
      deps,
      FIXED_NOW,
    );

    expect(deps.createLoanTx).toHaveBeenCalledWith({
      reservationId: 'res-1',
      copyId: 'copy-1',
      userId: 'user-1',
      librarianId: 'lib-42',
      dueAt: DUE_AT,
    });
  });

  it('não chama createLoanTx se a Reserva está expirada', async () => {
    const deps = makeDeps({
      findReservationById: vi.fn().mockResolvedValue(
        makeReservation({ expiresAt: PAST_DATE }),
      ),
    });

    await createLoan(
      { reservationId: 'res-1', librarianId: 'lib-1', dueAt: DUE_AT },
      deps,
      FIXED_NOW,
    ).catch(() => undefined);

    expect(deps.createLoanTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// returnLoan()
// ---------------------------------------------------------------------------

describe('returnLoan()', () => {
  it('registra Devolução com sucesso (RF-B5)', async () => {
    const deps = makeDeps();

    await expect(
      returnLoan({ loanId: 'loan-1', librarianId: 'lib-1' }, deps, FIXED_NOW),
    ).resolves.toBeUndefined();
  });

  it('busca o Empréstimo pelo loanId informado', async () => {
    const deps = makeDeps();

    await returnLoan({ loanId: 'loan-99', librarianId: 'lib-1' }, deps, FIXED_NOW);

    expect(deps.findLoanById).toHaveBeenCalledWith('loan-99');
  });

  it('lança NOT_FOUND quando o Empréstimo não existe', async () => {
    const deps = makeDeps({
      findLoanById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      returnLoan({ loanId: 'loan-x', librarianId: 'lib-1' }, deps, FIXED_NOW),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      returnLoan({ loanId: 'loan-x', librarianId: 'lib-1' }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lança CONFLICT quando o Empréstimo já foi devolvido (idempotência)', async () => {
    const deps = makeDeps({
      findLoanById: vi.fn().mockResolvedValue(
        makeLoan({ returnedAt: PAST_DATE }),
      ),
    });

    await expect(
      returnLoan({ loanId: 'loan-1', librarianId: 'lib-1' }, deps, FIXED_NOW),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('passa loanId e returnedAt = now para returnLoanTx (RN-5)', async () => {
    const deps = makeDeps();

    await returnLoan({ loanId: 'loan-1', librarianId: 'lib-1' }, deps, FIXED_NOW);

    expect(deps.returnLoanTx).toHaveBeenCalledWith({
      loanId: 'loan-1',
      returnedAt: FIXED_NOW,
    });
  });

  it('não chama returnLoanTx se o Empréstimo não existe', async () => {
    const deps = makeDeps({
      findLoanById: vi.fn().mockResolvedValue(null),
    });

    await returnLoan({ loanId: 'loan-1', librarianId: 'lib-1' }, deps, FIXED_NOW).catch(
      () => undefined,
    );

    expect(deps.returnLoanTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listLoans()
// ---------------------------------------------------------------------------

describe('listLoans()', () => {
  it('retorna lista de Empréstimos ativos do Leitor (RF-L5)', async () => {
    const loans = [makeLoanSummary()];
    const deps = makeDeps({
      findLoans: vi.fn().mockResolvedValue(loans),
    });

    const result = await listLoans({ userId: 'user-1', onlyActive: true }, deps);

    expect(result).toEqual(loans);
    expect(deps.findLoans).toHaveBeenCalledWith({ userId: 'user-1', onlyActive: true });
  });

  it('retorna todos os Empréstimos para o Bibliotecário (RF-B2)', async () => {
    const loans = [
      makeLoanSummary(),
      makeLoanSummary({ id: 'loan-2', returnedAt: PAST_DATE.toISOString() }),
    ];
    const deps = makeDeps({
      findLoans: vi.fn().mockResolvedValue(loans),
    });

    const result = await listLoans({}, deps);

    expect(result).toHaveLength(2);
    expect(deps.findLoans).toHaveBeenCalledWith({});
  });

  it('filtra por Leitor para o Bibliotecário (RF-B3)', async () => {
    const deps = makeDeps({
      findLoans: vi.fn().mockResolvedValue([makeLoanSummary()]),
    });

    await listLoans({ userId: 'user-42' }, deps);

    expect(deps.findLoans).toHaveBeenCalledWith({ userId: 'user-42' });
  });

  it('retorna lista vazia quando não há Empréstimos', async () => {
    const deps = makeDeps({
      findLoans: vi.fn().mockResolvedValue([]),
    });

    const result = await listLoans({ userId: 'user-sem-emprestimos' }, deps);

    expect(result).toEqual([]);
  });

  it('inclui dados do Bibliotecário em cada Empréstimo (RN-7)', async () => {
    const loan = makeLoanSummary({
      librarian: { id: 'lib-5', name: 'Carlos Bibliotecário' },
    });
    const deps = makeDeps({
      findLoans: vi.fn().mockResolvedValue([loan]),
    });

    const [result] = await listLoans({}, deps);

    expect(result?.librarian.name).toBe('Carlos Bibliotecário');
  });
});
