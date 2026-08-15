/**
 * packages/api/src/infra/repositories/bookRepository.ts
 * ÚNICO ponto de acesso às tabelas `books`, `copies` e `reviews` via Prisma.
 * Sem regras de negócio — apenas leitura de dados.
 *
 * Invariante arquitetural: nenhuma outra camada acessa o banco diretamente.
 * Terminologia segue docs/produto/glossario.md (Livro, Cópia, Disponibilidade).
 */

import { prisma } from '../prisma.js';
import type { BookSummary, BookDetail, ListBooksFilter } from '../../domain/book/bookTypes.js';

// ---------------------------------------------------------------------------
// Constante para queries
// ---------------------------------------------------------------------------

/** Número de avaliações recentes exibidas na página de detalhes (PRD §8) */
const RECENT_REVIEWS_LIMIT = 5;

// ---------------------------------------------------------------------------
// findBooks — para listBooks() (RF-L1)
// ---------------------------------------------------------------------------

export async function findBooks(
  filter: ListBooksFilter,
): Promise<{ books: BookSummary[]; total: number }> {
  const { search, genre, page, pageSize } = filter;
  const skip = (page - 1) * pageSize;

  // Busca por texto (RF-L1): um Livro casa se o título OU o nome do Autor casam.
  // Em vez de um OR cruzando `authors` via join (que impede o índice trigram de
  // `books.title` e força seq scan em escala), resolvemos primeiro os Autores que
  // casam (tabela pequena) e filtramos por `authorId IN (...)`. Assim o trigram de
  // título é usado e o OR fica todo em `books`. Semanticamente equivalente.
  let searchWhere: object = {};
  if (search) {
    const matchingAuthors = await prisma.author.findMany({
      where: { name: { contains: search, mode: 'insensitive' } },
      select: { id: true },
    });
    const authorIds = matchingAuthors.map((a) => a.id);
    searchWhere = {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        ...(authorIds.length > 0 ? [{ authorId: { in: authorIds } }] : []),
      ],
    };
  }

  const where = { AND: [genre ? { genre } : {}, searchWhere] };

  return prisma.$transaction(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.book.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          isbn: true,
          title: true,
          genre: true,
          coverUrl: true,
          author: { select: { id: true, name: true, slug: true } },
        },
      }),
      tx.book.count({ where }),
    ]);

    // Disponibilidade: conta as Cópias 'available' APENAS dos Livros desta página,
    // em vez de agregar toda a tabela `copies` (RN-3, índice [bookId, status]).
    const bookIds = rows.map((r) => r.id);
    const grouped =
      bookIds.length > 0
        ? await tx.copy.groupBy({
            by: ['bookId'],
            where: { bookId: { in: bookIds }, status: 'available' },
            _count: { _all: true },
          })
        : [];
    const availableByBook = new Map(grouped.map((g) => [g.bookId, g._count._all]));

    const books: BookSummary[] = rows.map((row) => ({
      id: row.id,
      isbn: row.isbn,
      title: row.title,
      genre: row.genre,
      coverUrl: row.coverUrl,
      author: row.author,
      availableCopies: availableByBook.get(row.id) ?? 0,
    }));

    return { books, total };
  });
}

// ---------------------------------------------------------------------------
// findBookById — para getBook() (RF-L2, RNF-1 < 300 ms)
// ---------------------------------------------------------------------------

export async function findBookById(id: string): Promise<BookDetail | null> {
  const row = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      isbn: true,
      title: true,
      synopsis: true,
      genre: true,
      coverUrl: true,
      publishedAt: true,
      author: {
        select: { id: true, name: true, slug: true },
      },
      // Disponibilidade: conta apenas as Cópias com status 'available' (RN-3)
      // Índice @@index([bookId, status]) garante latência < 300 ms (RNF-1)
      _count: {
        select: {
          copies: {
            where: { status: 'available' },
          },
        },
      },
      // 5 avaliações mais recentes (PRD §8)
      reviews: {
        take: RECENT_REVIEWS_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    genre: row.genre,
    coverUrl: row.coverUrl,
    synopsis: row.synopsis,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    author: row.author,
    availableCopies: row._count.copies,
    recentReviews: row.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      user: { id: r.user.id, name: r.user.name },
    })),
  };
}
