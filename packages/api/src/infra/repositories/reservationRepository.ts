/**
 * packages/api/src/infra/repositories/reservationRepository.ts
 * ÚNICO ponto de acesso às tabelas `reservations` e `copies` via Prisma.
 * Sem regras de negócio — apenas persistência e leitura de dados.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente.
 * Terminologia segue docs/produto/glossario.md (Reserva, Cópia, Leitor).
 */

import { prisma } from '../prisma.js';
import { bookExists } from './bookRepository.js';
import type {
  CreateReservationTxResult,
  ReservationServiceDeps,
} from '../../domain/reservation/reservationService.js';
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
 * Persiste a nova Reserva e marca a Cópia como 'reserved' em uma única transação,
 * decidindo ali dentro as três recusas possíveis (RN-3, RN-9, RN-10).
 *
 * **RN-3 — a Cópia.** O UPDATE é condicionado a `status: 'available'`: é ele que
 * decide quem leva a última Cópia. Duas requisições concorrentes enxergam a mesma
 * Cópia livre em findAvailableCopy; a segunda espera o lock da linha, reavalia o
 * WHERE depois do commit da primeira e não afeta nenhuma linha — daí `count === 0`.
 * Sem essa condição a transação existia mas não protegia nada: oito pedidos
 * simultâneos pela última Cópia criavam oito Reservas (RN-3, RN-4). Coberto por
 * `e2e/regras-negocio-api.spec.ts`.
 *
 * **RN-9 e RN-10 — o Leitor.** Aqui o UPDATE condicional não serve: duas Reservas
 * do mesmo Livro pegam Cópias **diferentes**, então não há linha em disputa, e um
 * teto de contagem não é uma unicidade que o banco saiba impor. Sem serializar, as
 * duas transações leem o mesmo total sob READ COMMITTED e passam juntas. O
 * `SELECT ... FOR UPDATE` na linha do Leitor resolve os dois: enfileira as
 * tentativas **daquele** Leitor sem tocar nas dos demais.
 *
 * **Por que não um índice parcial único** em `(user_id, book_id)`, como a issue #28
 * sugeria: "ativa" inclui `expires_at > now()`, que não entra em predicado de
 * índice por não ser imutável. Restaria indexar por `cancelled_at IS NULL` — e
 * como o job de expiração roda a cada 60 s, uma Reserva vencida mas ainda não
 * processada continuaria casando com o predicado, transformando um pedido legítimo
 * em violação de índice (500) por até um minuto. O lock não tem essa janela.
 */
export async function createReservationTx(params: {
  userId: string;
  bookId: string;
  copyId: string;
  expiresAt: Date;
  now: Date;
  maxActiveReservations: number;
}): Promise<CreateReservationTxResult> {
  const { userId, bookId, copyId, expiresAt, now, maxActiveReservations } = params;

  return prisma.$transaction(async (tx) => {
    // Serializa as tentativas deste Leitor até o fim da transação. Precisa vir
    // antes de qualquer contagem, senão a contagem já nasce desatualizada.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    /** Reserva ativa: não vencida, não convertida, não cancelada. */
    const ativa = { expiresAt: { gt: now }, convertedAt: null, cancelledAt: null } as const;

    // RN-9 — já tem este Livro reservado?
    const reservasDesteLivro = await tx.reservation.count({
      where: { userId, ...ativa, copy: { bookId } },
    });
    if (reservasDesteLivro > 0) return { ok: false, reason: 'duplicate_book' };

    // RN-9 — ou emprestado, o que para o acervo dá no mesmo: a Cópia está com ele.
    const emprestimosDesteLivro = await tx.loan.count({
      where: { userId, returnedAt: null, copy: { bookId } },
    });
    if (emprestimosDesteLivro > 0) return { ok: false, reason: 'duplicate_book' };

    // RN-10 — teto de Reservas ativas simultâneas.
    const ativas = await tx.reservation.count({ where: { userId, ...ativa } });
    if (ativas >= maxActiveReservations) return { ok: false, reason: 'limit_reached' };

    // RN-3/RN-4 — a Cópia, e só então a Reserva.
    const { count } = await tx.copy.updateMany({
      where: { id: copyId, status: 'available' },
      data: { status: 'reserved' },
    });
    if (count === 0) return { ok: false, reason: 'copy_taken' };

    const reservation = await tx.reservation.create({
      data: { userId, copyId, expiresAt },
      select: { id: true },
    });

    return { ok: true, reservationId: reservation.id };
  });
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
  // `books` é do bookRepository — este arquivo continua dono só de `reservations` e
  // `copies`. Aqui a função só é composta nas dependências do serviço, não redefinida.
  bookExists,
  createReservationTx,
  findActiveReservationsByUser,
  findReservationsByBook,
};
