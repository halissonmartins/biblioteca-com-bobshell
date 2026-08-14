/**
 * packages/api/src/domain/loan/loanService.ts
 * Casos de uso do domínio de Empréstimo e Devolução — lógica pura, sem HTTP, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Casos de uso implementados:
 *   - createLoan   — efetiva Empréstimo a partir de Reserva ativa (RF-B4, RN-2, RN-6, RN-7)
 *   - returnLoan   — registra Devolução e libera a Cópia (RF-B5, RN-5)
 *   - listLoans    — lista Empréstimos com filtro opcional por Leitor (RF-L5, RF-B2, RF-B3)
 */

import { AppError } from '../../shared/errors.js';
import type {
  CreateLoanInput,
  CreateLoanResult,
  ListLoansFilter,
  LoanSummary,
  ReturnLoanInput,
} from './loanTypes.js';

// ---------------------------------------------------------------------------
// Tipos de dependência (port / secondary adapter interface)
// ---------------------------------------------------------------------------

/** Dados mínimos de uma Reserva necessários para validar e converter em Empréstimo */
export interface ReservationForLoan {
  id: string;
  copyId: string;
  userId: string;
  expiresAt: Date;
  convertedAt: Date | null;
  cancelledAt: Date | null;
}

/** Dados mínimos de um Empréstimo necessários para registrar Devolução */
export interface LoanForReturn {
  id: string;
  copyId: string;
  returnedAt: Date | null;
}

export interface LoanServiceDeps {
  /**
   * Busca uma Reserva pelo id.
   * Retorna null se não encontrada.
   */
  findReservationById: (reservationId: string) => Promise<ReservationForLoan | null>;

  /**
   * Persiste o novo Empréstimo, marca a Cópia como 'loaned' e a Reserva como convertida
   * em uma única transação (RN-6, race condition).
   */
  createLoanTx: (params: {
    reservationId: string;
    copyId: string;
    userId: string;
    librarianId: string;
    dueAt: Date;
  }) => Promise<{ loanId: string }>;

  /**
   * Busca um Empréstimo pelo id.
   * Retorna null se não encontrado.
   */
  findLoanById: (loanId: string) => Promise<LoanForReturn | null>;

  /**
   * Persiste a Devolução: seta returnedAt e libera a Cópia para 'available'
   * em uma única transação (RN-5).
   */
  returnLoanTx: (params: {
    loanId: string;
    returnedAt: Date;
  }) => Promise<void>;

  /** Lista Empréstimos, opcionalmente filtrados por Leitor e/ou status aberto (RF-L5, RF-B2, RF-B3) */
  findLoans: (filter: ListLoansFilter) => Promise<LoanSummary[]>;
}

// ---------------------------------------------------------------------------
// createLoan — RF-B4, RN-2, RN-6
// ---------------------------------------------------------------------------

export async function createLoan(
  input: CreateLoanInput,
  deps: LoanServiceDeps,
  now: Date = new Date(),
): Promise<CreateLoanResult> {
  // RN-6: buscar a Reserva e validar existência
  const reservation = await deps.findReservationById(input.reservationId);
  if (!reservation) {
    throw new AppError(
      'NOT_FOUND',
      'Reserva não encontrada.',
    );
  }

  // RN-6: só Reservas ativas (não expiradas, não convertidas, não canceladas) viram Empréstimo
  if (reservation.convertedAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Esta reserva já foi convertida em empréstimo.',
    );
  }

  if (reservation.cancelledAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Esta reserva foi cancelada e não pode ser convertida em empréstimo.',
    );
  }

  if (reservation.expiresAt <= now) {
    throw new AppError(
      'RESERVATION_EXPIRED',
      'A reserva expirou e não pode ser convertida em empréstimo.',
    );
  }

  // Persiste atomicamente: Empréstimo criado + Cópia → 'loaned' + Reserva → convertedAt = now
  const { loanId } = await deps.createLoanTx({
    reservationId: input.reservationId,
    copyId: reservation.copyId,
    userId: reservation.userId,
    librarianId: input.librarianId,
    dueAt: input.dueAt,
  });

  return {
    loanId,
    copyId: reservation.copyId,
    dueAt: input.dueAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// returnLoan — RF-B5, RN-5
// ---------------------------------------------------------------------------

export async function returnLoan(
  input: ReturnLoanInput,
  deps: LoanServiceDeps,
  now: Date = new Date(),
): Promise<void> {
  const loan = await deps.findLoanById(input.loanId);
  if (!loan) {
    throw new AppError(
      'NOT_FOUND',
      'Empréstimo não encontrado.',
    );
  }

  // Idempotência: não permite devolver duas vezes
  if (loan.returnedAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Este empréstimo já foi devolvido.',
    );
  }

  // RN-5: libera a Cópia atomicamente ao registrar a Devolução
  await deps.returnLoanTx({
    loanId: input.loanId,
    returnedAt: now,
  });
}

// ---------------------------------------------------------------------------
// listLoans — RF-L5, RF-B2, RF-B3
// ---------------------------------------------------------------------------

export async function listLoans(
  filter: ListLoansFilter,
  deps: LoanServiceDeps,
): Promise<LoanSummary[]> {
  return deps.findLoans(filter);
}
