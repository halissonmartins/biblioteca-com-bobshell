/**
 * packages/api/src/infra/repositories/loanRepository.ts
 * ÚNICO ponto de acesso às tabelas `loans` e `copies` via Prisma para Empréstimos.
 * Sem regras de negócio — apenas persistência e leitura de dados.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente.
 * Terminologia segue docs/produto/glossario.md (Empréstimo, Cópia, Leitor, Bibliotecário).
 */

import { prisma } from '../prisma.js';
import type { LoanServiceDeps, ReservationForLoan, LoanForReturn } from '../../domain/loan/loanService.js';
import type { LoanSummary } from '../../domain/loan/loanTypes.js';

// ---------------------------------------------------------------------------
// findReservationById — RN-6
// ---------------------------------------------------------------------------

/**
 * Busca uma Reserva pelo id para validação antes de criar Empréstimo.
 * Retorna null se não encontrada.
 */
export async function findReservationById(
  reservationId: string,
): Promise<ReservationForLoan | null> {
  const row = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      copyId: true,
      userId: true,
      expiresAt: true,
      convertedAt: true,
      cancelledAt: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    copyId: row.copyId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    convertedAt: row.convertedAt,
    cancelledAt: row.cancelledAt,
  };
}

// ---------------------------------------------------------------------------
// createLoanTx — RF-B4, RN-6: Empréstimo + Cópia → 'loaned' + Reserva convertida
// ---------------------------------------------------------------------------

/**
 * Persiste o Empréstimo, marca a Cópia como 'loaned' e a Reserva como convertida
 * em uma única transação (protege contra race condition — RN-6).
 */
export async function createLoanTx(params: {
  reservationId: string;
  copyId: string;
  userId: string;
  librarianId: string;
  dueAt: Date;
}): Promise<{ loanId: string }> {
  const { reservationId, copyId, userId, librarianId, dueAt } = params;
  const now = new Date();

  const [loan] = await prisma.$transaction([
    prisma.loan.create({
      data: { reservationId, copyId, userId, librarianId, dueAt },
      select: { id: true },
    }),
    prisma.copy.update({
      where: { id: copyId },
      data: { status: 'loaned' },
    }),
    prisma.reservation.update({
      where: { id: reservationId },
      data: { convertedAt: now },
    }),
  ]);

  return { loanId: loan.id };
}

// ---------------------------------------------------------------------------
// findLoanById — para validar antes de registrar Devolução
// ---------------------------------------------------------------------------

/**
 * Busca um Empréstimo pelo id.
 * Retorna null se não encontrado.
 */
export async function findLoanById(loanId: string): Promise<LoanForReturn | null> {
  const row = await prisma.loan.findUnique({
    where: { id: loanId },
    select: { id: true, copyId: true, returnedAt: true },
  });
  if (!row) return null;
  return { id: row.id, copyId: row.copyId, returnedAt: row.returnedAt };
}

// ---------------------------------------------------------------------------
// returnLoanTx — RF-B5, RN-5: Devolução + Cópia → 'available'
// ---------------------------------------------------------------------------

/**
 * Persiste a Devolução (seta returnedAt) e libera a Cópia para 'available'
 * em uma única transação (RN-5).
 */
export async function returnLoanTx(params: {
  loanId: string;
  returnedAt: Date;
}): Promise<void> {
  const { loanId, returnedAt } = params;

  // Busca o copyId antes da transação
  const loan = await prisma.loan.findUniqueOrThrow({
    where: { id: loanId },
    select: { copyId: true },
  });

  await prisma.$transaction([
    prisma.loan.update({
      where: { id: loanId },
      data: { returnedAt },
    }),
    prisma.copy.update({
      where: { id: loan.copyId },
      data: { status: 'available' },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// findLoans — RF-L5, RF-B2, RF-B3
// ---------------------------------------------------------------------------

const LOAN_SELECT = {
  id: true,
  dueAt: true,
  returnedAt: true,
  createdAt: true,
  copy: {
    select: {
      id: true,
      code: true,
      book: { select: { id: true, title: true, coverUrl: true, author: { select: { id: true, name: true } } } },
    },
  },
  user: { select: { id: true, name: true, email: true } },
  librarian: { select: { id: true, name: true } },
} as const;

/**
 * Lista Empréstimos, opcionalmente filtrados por Leitor e/ou status em aberto.
 * Usado por RF-L5 (leitor vê os próprios) e RF-B2/RF-B3 (bibliotecário filtra por leitor).
 */
export async function findLoans(filter: {
  userId?: string;
  onlyActive?: boolean;
}): Promise<LoanSummary[]> {
  const rows = await prisma.loan.findMany({
    where: {
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.onlyActive ? { returnedAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: LOAN_SELECT,
  });

  return rows.map((row) => ({
    id: row.id,
    dueAt: row.dueAt.toISOString(),
    returnedAt: row.returnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    copy: {
      id: row.copy.id,
      code: row.copy.code,
      book: {
        id: row.copy.book.id,
        title: row.copy.book.title,
        coverUrl: row.copy.book.coverUrl,
        author: { id: row.copy.book.author.id, name: row.copy.book.author.name },
      },
    },
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
    },
    librarian: {
      id: row.librarian.id,
      name: row.librarian.name,
    },
  }));
}

// ---------------------------------------------------------------------------
// findLoanDetail — busca Empréstimo completo por id para resposta da API
// ---------------------------------------------------------------------------

export async function findLoanDetail(loanId: string): Promise<LoanSummary | null> {
  const row = await prisma.loan.findUnique({
    where: { id: loanId },
    select: LOAN_SELECT,
  });
  if (!row) return null;
  return {
    id: row.id,
    dueAt: row.dueAt.toISOString(),
    returnedAt: row.returnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    copy: {
      id: row.copy.id,
      code: row.copy.code,
      book: {
        id: row.copy.book.id,
        title: row.copy.book.title,
        coverUrl: row.copy.book.coverUrl,
        author: { id: row.copy.book.author.id, name: row.copy.book.author.name },
      },
    },
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
    },
    librarian: {
      id: row.librarian.id,
      name: row.librarian.name,
    },
  };
}

// ---------------------------------------------------------------------------
// Objeto de dependências prontas para injetar no loanService
// ---------------------------------------------------------------------------

export const loanRepoDeps: LoanServiceDeps = {
  findReservationById,
  createLoanTx,
  findLoanById,
  returnLoanTx,
  findLoans,
};
