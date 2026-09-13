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
   * Retorna null se a Reserva foi convertida entre a validação acima e a escrita —
   * outra requisição levou a mesma Reserva primeiro.
   */
  createLoanTx: (params: {
    reservationId: string;
    copyId: string;
    userId: string;
    librarianId: string;
    dueAt: Date;
  }) => Promise<{ loanId: string } | null>;

  /**
   * Busca um Empréstimo pelo id.
   * Retorna null se não encontrado.
   */
  findLoanById: (loanId: string) => Promise<LoanForReturn | null>;

  /**
   * Persiste a Devolução: seta returnedAt e libera a Cópia para 'available'
   * em uma única transação (RN-5), decidindo o vencedor por UPDATE condicional.
   * Retorna false se a Devolução já tinha sido registrada entre a validação do
   * serviço e a escrita — outra requisição (ou o duplo clique) chegou primeiro.
   */
  returnLoanTx: (params: {
    loanId: string;
    returnedAt: Date;
  }) => Promise<boolean>;

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

  // O cancelamento vem primeiro desde a issue #20. Antes dela, `cancelledAt` era
  // onde o job de expiração registrava o vencimento (RN-1): toda Reserva vencida
  // chegava aqui "cancelada", e dizer isso ao Bibliotecário mandava ele procurar
  // um cancelamento que ninguém fez — por isso o prazo era checado antes. Agora
  // `cancelledAt` só existe quando o Leitor desistiu (RF-L8), e essa é a
  // informação mais útil no balcão: o Leitor está na frente dele perguntando pelo
  // livro que ele mesmo liberou.
  if (reservation.cancelledAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Esta reserva foi cancelada pelo leitor e não pode ser convertida em empréstimo.',
    );
  }

  // `expiresAt <= now` cobre a janela de até 60 s antes de o job marcar
  // `expiredAt`: a resposta não depende de o job ter passado.
  if (reservation.expiresAt <= now) {
    throw new AppError(
      'RESERVATION_EXPIRED',
      'A reserva expirou e não pode ser convertida em empréstimo.',
    );
  }

  // Persiste atomicamente: Empréstimo criado + Cópia → 'loaned' + Reserva → convertedAt = now
  const created = await deps.createLoanTx({
    reservationId: input.reservationId,
    copyId: reservation.copyId,
    userId: reservation.userId,
    librarianId: input.librarianId,
    dueAt: input.dueAt,
  });

  // RN-6: a leitura da Reserva e a escrita do Empréstimo não são o mesmo instante.
  // Três escritas disputam esta linha — outra efetivação, o cancelamento pelo
  // Leitor (RF-L8) e o job de expiração — e o UPDATE condicional de
  // `createLoanTx` deixa passar uma só. A mensagem não nomeia qual delas chegou
  // primeiro de propósito: para o Bibliotecário com o Leitor na frente dele, o
  // que importa é que esta Reserva não serve mais e a lista precisa ser relida.
  if (!created) {
    throw new AppError(
      'CONFLICT',
      'Esta reserva já foi encerrada e não pode ser convertida em empréstimo. Atualize a lista.',
    );
  }

  return {
    loanId: created.loanId,
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

  // Idempotência: não permite devolver duas vezes. Este é o caminho comum (a
  // lista já mostrava a Devolução); a corrida real é decidida na transação.
  if (loan.returnedAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Este empréstimo já foi devolvido.',
    );
  }

  // RN-5: libera a Cópia atomicamente ao registrar a Devolução. O UPDATE
  // condicional de `returnLoanTx` decide o vencedor entre Devoluções
  // concorrentes; quem perde a corrida não afeta linha e recebe o mesmo 409 do
  // caminho acima — sem reescrever `returnedAt` nem liberar Cópia de outrem.
  const returned = await deps.returnLoanTx({
    loanId: input.loanId,
    returnedAt: now,
  });

  if (!returned) {
    throw new AppError(
      'CONFLICT',
      'Este empréstimo já foi devolvido.',
    );
  }
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
