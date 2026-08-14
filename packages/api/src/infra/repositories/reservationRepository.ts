/**
 * packages/api/src/infra/repositories/reservationRepository.ts
 * ÚNICO ponto de acesso às tabelas `reservations` e `copies` via Prisma.
 * Sem regras de negócio — apenas persistência e leitura de dados.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente.
 * Terminologia segue docs/produto/glossario.md (Reserva, Cópia, Leitor).
 */

import { prisma } from '../prisma.js';
import type { ReservationServiceDeps } from '../../domain/reservation/reservationService.js';
import type { ReservationSummary, ReservationDetail } from '../../domain/reservation/reservationTypes.js';

// ---------------------------------------------------------------------------
// findAvailableCopy — RN-3
// ---------------------------------------------------------------------------

/**
 * Retorna UMA Cópia com status='available' para o Livro, ou null se não houver.
 * Usada por createReservation para verificar disponibilidade (RN-3).
 */
export async function findAvailableCopy(
  bookId: string,
): Promise<{ id: string; code: string } | null> {
  const copy = await prisma.copy.findFirst({
    where: { bookId, status: 'available' },
    select: { id: true, code: true },
    // Índice @@index([bookId, status]) garante latência < 300 ms (RNF-1)
  });
  return copy ?? null;
}

// ---------------------------------------------------------------------------
// createReservationTx — RN-4: Reserva + Cópia → 'reserved' atomicamente
// ---------------------------------------------------------------------------

/**
 * Persiste a nova Reserva e marca a Cópia como 'reserved' em uma única transação.
 * Protege contra race condition (dois leitores reservando a mesma Cópia ao mesmo tempo).
 */
export async function createReservationTx(params: {
  userId: string;
  copyId: string;
  expiresAt: Date;
}): Promise<{ reservationId: string }> {
  const { userId, copyId, expiresAt } = params;

  const [reservation] = await prisma.$transaction([
    prisma.reservation.create({
      data: { userId, copyId, expiresAt },
      select: { id: true },
    }),
    prisma.copy.update({
      where: { id: copyId },
      data: { status: 'reserved' },
    }),
  ]);

  return { reservationId: reservation.id };
}

// ---------------------------------------------------------------------------
// findActiveReservationsByUser — RF-L4
// ---------------------------------------------------------------------------

/**
 * Lista as Reservas ativas (não expiradas, não convertidas, não canceladas) do Leitor.
 * "Ativa" é computada no banco: expiresAt > now AND convertedAt IS NULL AND cancelledAt IS NULL.
 */
export async function findActiveReservationsByUser(filter: {
  userId: string;
}): Promise<ReservationSummary[]> {
  const now = new Date();
  const rows = await prisma.reservation.findMany({
    where: {
      userId: filter.userId,
      expiresAt: { gt: now },
      convertedAt: null,
      cancelledAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      copy: {
        select: {
          id: true,
          code: true,
          book: {
            select: { id: true, title: true, coverUrl: true, author: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    expiresAt: row.expiresAt.toISOString(),
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
  }));
}

// ---------------------------------------------------------------------------
// findReservationsByBook — RF-B1
// ---------------------------------------------------------------------------

/**
 * Lista TODAS as Reservas de um Livro (ativas e encerradas), incluindo dados do Leitor.
 * O status é derivado no momento da leitura — não persiste como campo separado.
 */
export async function findReservationsByBook(filter: {
  bookId: string;
}): Promise<ReservationDetail[]> {
  const now = new Date();
  const rows = await prisma.reservation.findMany({
    where: { copy: { bookId: filter.bookId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      convertedAt: true,
      cancelledAt: true,
      copy: {
        select: {
          id: true,
          code: true,
          book: {
            select: { id: true, title: true, coverUrl: true, author: { select: { id: true, name: true } } },
          },
        },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return rows.map((row) => {
    let status: ReservationDetail['status'];
    if (row.convertedAt !== null) {
      status = 'converted';
    } else if (row.cancelledAt !== null) {
      status = 'cancelled';
    } else if (row.expiresAt <= now) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      convertedAt: row.convertedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
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
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// expireReservationsTx — RN-1, RN-5 (usado pelo job de expiração)
// ---------------------------------------------------------------------------

/**
 * Expira em lote todas as Reservas cujo expiresAt <= now e que ainda não foram
 * convertidas nem canceladas. Para cada Reserva expirada, libera a Cópia de volta
 * ao status 'available' (RN-5). Tudo em uma única transação.
 *
 * Retorna o número de Reservas expiradas.
 */
export async function expireReservationsTx(now: Date): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      expiresAt: { lte: now },
      convertedAt: null,
      cancelledAt: null,
    },
    select: { id: true, copyId: true },
  });

  if (expired.length === 0) return 0;

  const copyIds = expired.map((r) => r.copyId);
  const reservationIds = expired.map((r) => r.id);

  await prisma.$transaction([
    // Marca Reservas como canceladas (campo cancelledAt registra expiração — RN-1)
    prisma.reservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { cancelledAt: now },
    }),
    // Libera as Cópias de volta ao acervo disponível (RN-5)
    prisma.copy.updateMany({
      where: { id: { in: copyIds }, status: 'reserved' },
      data: { status: 'available' },
    }),
  ]);

  return expired.length;
}

// ---------------------------------------------------------------------------
// findReservationDetail — busca Reserva completa por id para resposta da API
// ---------------------------------------------------------------------------

/**
 * Busca uma Reserva pelo id e retorna o detalhe completo (inclui dados do leitor).
 * Usada pela rota POST /reservations para montar a resposta de criação.
 */
export async function findReservationDetail(reservationId: string): Promise<ReservationDetail | null> {
  const now = new Date();
  const row = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      convertedAt: true,
      cancelledAt: true,
      copy: {
        select: {
          id: true,
          code: true,
          book: { select: { id: true, title: true, coverUrl: true, author: { select: { id: true, name: true } } } },
        },
      },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) return null;

  let status: ReservationDetail['status'];
  if (row.convertedAt !== null) {
    status = 'converted';
  } else if (row.cancelledAt !== null) {
    status = 'cancelled';
  } else if (row.expiresAt <= now) {
    status = 'expired';
  } else {
    status = 'active';
  }

  return {
    id: row.id,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    convertedAt: row.convertedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
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
    status,
  };
}

// ---------------------------------------------------------------------------
// findAllReservations — RF-B1, RF-B3: todas as Reservas com filtro opcional por Leitor
// ---------------------------------------------------------------------------

/**
 * Lista todas as Reservas do sistema, opcionalmente filtradas por Leitor.
 * Usada pelo dashboard do Bibliotecário (RF-B1, RF-B3).
 */
export async function findAllReservations(userId?: string): Promise<ReservationDetail[]> {
  const now = new Date();
  const rows = await prisma.reservation.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      convertedAt: true,
      cancelledAt: true,
      copy: {
        select: {
          id: true,
          code: true,
          book: { select: { id: true, title: true, coverUrl: true, author: { select: { id: true, name: true } } } },
        },
      },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((row) => {
    let status: ReservationDetail['status'];
    if (row.convertedAt !== null) {
      status = 'converted';
    } else if (row.cancelledAt !== null) {
      status = 'cancelled';
    } else if (row.expiresAt <= now) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      convertedAt: row.convertedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
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
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// Objeto de dependências prontas para injetar no reservationService
// ---------------------------------------------------------------------------

export const reservationRepoDeps: ReservationServiceDeps = {
  findAvailableCopy,
  createReservationTx,
  findActiveReservationsByUser,
  findReservationsByBook,
};
