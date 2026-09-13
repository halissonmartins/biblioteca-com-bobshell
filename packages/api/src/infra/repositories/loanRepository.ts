/**
 * packages/api/src/infra/repositories/loanRepository.ts
 * ÚNICO ponto de acesso às tabelas `loans` e `copies` via Prisma para Empréstimos.
 * Sem regras de negócio — apenas persistência e leitura de dados.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente.
 * Terminologia segue docs/produto/glossario.md (Empréstimo, Cópia, Leitor, Bibliotecário).
 */

import { prisma } from '../prisma.js';
import { conversaoDuracao } from '../telemetry/metrics.js';
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
 * em uma única transação (RN-6).
 * Retorna null se a Reserva ganhou outro desfecho entre a validação do serviço e
 * a escrita — outro Bibliotecário (ou o mesmo com dois cliques) converteu
 * primeiro, ou o Leitor cancelou no mesmo instante.
 *
 * O UPDATE da Reserva vem ANTES da criação do Empréstimo: é ele que decide quem
 * converte. Duas requisições concorrentes passam juntas pelas checagens do
 * serviço; a segunda espera o lock da linha da Reserva, reavalia o WHERE depois
 * do commit da primeira e não afeta nenhuma linha — daí `count === 0`. Sem essa
 * condição a corrida ia parar no índice único de `loans.reservationId`, e a
 * violação crua do Prisma virava 500 na borda, no lugar do 409 que a regra já
 * previa. Mesmo desenho de `createReservationTx`.
 *
 * **O WHERE cobre os três desfechos, não só `convertedAt`.** Com `convertedAt:
 * null` sozinho, o cancelamento pelo Leitor (RF-L8) não era visto por esta
 * escrita: o cancelamento commitava primeiro, gravava `cancelledAt`, devolvia a
 * Cópia ao acervo — e este UPDATE ainda casava, criando um Empréstimo sobre uma
 * Reserva cancelada e deixando a Cópia 'loaned' com o registro dizendo que o
 * Leitor desistiu. Pior: na ordem inversa, a Cópia terminava 'available' com o
 * livro fisicamente fora da biblioteca, e a Disponibilidade passava a mentir
 * para todos os Leitores. As duas escritas disputam a mesma linha e agora se
 * excluem de verdade. Coberto por `regras-negocio-api.spec.ts`.
 */
export async function createLoanTx(params: {
  reservationId: string;
  copyId: string;
  userId: string;
  librarianId: string;
  dueAt: Date;
}): Promise<{ loanId: string } | null> {
  const { reservationId, copyId, userId, librarianId, dueAt } = params;
  const now = new Date();

  const criado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.reservation.updateMany({
      where: {
        id: reservationId,
        convertedAt: null,
        expiredAt: null,
        cancelledAt: null,
        // O prazo entra no WHERE pela mesma razão: o job de expiração é a
        // terceira escrita que disputa esta linha.
        expiresAt: { gt: now },
      },
      data: { convertedAt: now },
    });
    if (count === 0) return null;

    const loan = await tx.loan.create({
      data: { reservationId, copyId, userId, librarianId, dueAt },
      select: { id: true },
    });

    await tx.copy.update({
      where: { id: copyId },
      data: { status: 'loaned' },
    });

    // createdAt sai da mesma transação: mede o tempo entre a Reserva e a
    // retirada. Alimenta a taxa de conversão Reserva→Empréstimo do PRD §11.
    // `updateMany` não devolve a linha, então a leitura é explícita — e só o
    // caminho vencedor paga por ela.
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { createdAt: true },
    });

    return { loanId: loan.id, reservaCriadaEm: reservation.createdAt };
  });

  if (criado === null) return null;

  conversaoDuracao.record((now.getTime() - criado.reservaCriadaEm.getTime()) / 1000);

  return { loanId: criado.loanId };
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
 *
 * O UPDATE da Devolução é condicionado a `returnedAt: null` e vem ANTES da
 * liberação da Cópia: é ele que decide o vencedor, mesmo desenho de
 * `createLoanTx` e `cancelReservationTx`. Duas Devoluções concorrentes — o
 * duplo clique do balcão, ou dois Bibliotecários na mesma linha — passam juntas
 * pela checagem do serviço; a segunda espera o lock da linha, reavalia o WHERE
 * depois do commit da primeira e não afeta nenhuma linha (retorna false).
 *
 * Sem essa condição, a segunda Devolução reescrevia `returnedAt` e forçava a
 * Cópia para 'available' de forma incondicional — inclusive quando outro Leitor
 * já a tinha reservado no intervalo, deixando uma Reserva ativa sobre uma Cópia
 * 'available' e fazendo a Disponibilidade mentir para todos (RN-4). Por isso a
 * liberação da Cópia também é condicionada a `status: 'loaned'`.
 *
 * Retorna false para quem não afetou linha nenhuma — o serviço traduz em 409.
 */
export async function returnLoanTx(params: {
  loanId: string;
  returnedAt: Date;
}): Promise<boolean> {
  const { loanId, returnedAt } = params;

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.loan.updateMany({
      where: { id: loanId, returnedAt: null },
      data: { returnedAt },
    });
    if (count === 0) return false;

    // Só a Devolução vencedora chega aqui; a Cópia estava 'loaned'.
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: loanId },
      select: { copyId: true },
    });

    await tx.copy.updateMany({
      where: { id: loan.copyId, status: 'loaned' },
      data: { status: 'available' },
    });

    return true;
  });
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
