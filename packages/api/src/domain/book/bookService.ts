/**
 * packages/api/src/domain/book/bookService.ts
 * Casos de uso do Catálogo — lógica pura, sem HTTP, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Casos de uso implementados:
 *   - listBooks  — catálogo paginado com busca (RF-L1, US-01)
 *   - getBook    — detalhes completos de um Livro (RF-L2, US-02)
 *   - getAuthor  — página do Autor com sua lista de Livros (RF-L6, US-06)
 */

import { AppError } from '../../shared/errors.js';
import type {
  BookSummary,
  BookDetail,
  AuthorDetail,
  ListBooksFilter,
  PaginatedResult,
} from './bookTypes.js';

// ---------------------------------------------------------------------------
// Tipos de dependência (port / secondary adapter interface)
// ---------------------------------------------------------------------------

export interface BookServiceDeps {
  findBooks: (filter: ListBooksFilter) => Promise<{ books: BookSummary[]; total: number }>;
  findBookById: (id: string) => Promise<BookDetail | null>;
  findAuthorBySlug: (slug: string) => Promise<AuthorDetail | null>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// listBooks — RF-L1, US-01
// ---------------------------------------------------------------------------

export async function listBooks(
  rawFilter: Partial<ListBooksFilter>,
  deps: BookServiceDeps,
): Promise<PaginatedResult<BookSummary>> {
  const page = Math.max(1, rawFilter.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, rawFilter.pageSize ?? DEFAULT_PAGE_SIZE),
  );

  const search = rawFilter.search?.trim() || undefined;
  const genre = rawFilter.genre?.trim() || undefined;
  const filter: ListBooksFilter = { page, pageSize };
  if (search !== undefined) filter.search = search;
  if (genre !== undefined) filter.genre = genre;

  const { books, total } = await deps.findBooks(filter);

  const totalPages = Math.ceil(total / pageSize);
  return { data: books, pagination: { page, pageSize, total, totalPages } };
}

// ---------------------------------------------------------------------------
// getBook — RF-L2, US-02
// ---------------------------------------------------------------------------

export async function getBook(
  bookId: string,
  deps: BookServiceDeps,
): Promise<BookDetail> {
  const book = await deps.findBookById(bookId);

  if (!book) {
    throw new AppError('NOT_FOUND', `Livro não encontrado: ${bookId}`);
  }

  return book;
}

// ---------------------------------------------------------------------------
// getAuthor — RF-L6, US-06
// ---------------------------------------------------------------------------

export async function getAuthor(
  slug: string,
  deps: BookServiceDeps,
): Promise<AuthorDetail> {
  const author = await deps.findAuthorBySlug(slug);

  if (!author) {
    throw new AppError('NOT_FOUND', `Autor não encontrado: ${slug}`);
  }

  return author;
}
