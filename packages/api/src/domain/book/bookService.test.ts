/**
 * packages/api/src/domain/book/bookService.test.ts
 * Testes unitários do bookService — sem banco real (deps injetados como stubs).
 *
 * Cobre:
 *   - listBooks: paginação, busca, sanitização de parâmetros
 *   - getBook: sucesso e NOT_FOUND
 *   - getAuthor: sucesso e NOT_FOUND
 */

import { describe, it, expect, vi } from 'vitest';
import { listBooks, getBook, getAuthor, type BookServiceDeps } from './bookService.js';
import { AppError } from '../../shared/errors.js';
import type { BookSummary, BookDetail, AuthorDetail, ListBooksFilter } from './bookTypes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTHOR_SUMMARY = {
  id: 'author-1',
  name: 'Machado de Assis',
  slug: 'machado-de-assis',
};

function makeBookSummary(overrides?: Partial<BookSummary>): BookSummary {
  return {
    id: 'book-1',
    isbn: '978-85-01-00001-0',
    title: 'Dom Casmurro',
    genre: 'Romance',
    coverUrl: null,
    author: AUTHOR_SUMMARY,
    availableCopies: 3,
    ...overrides,
  };
}

function makeBookDetail(overrides?: Partial<BookDetail>): BookDetail {
  return {
    ...makeBookSummary(),
    synopsis: 'A história de Bentinho e Capitu.',
    publishedAt: '1899-01-01T00:00:00.000Z',
    recentReviews: [],
    ...overrides,
  };
}

function makeAuthorDetail(overrides?: Partial<AuthorDetail>): AuthorDetail {
  return {
    ...AUTHOR_SUMMARY,
    bio: 'Escritor brasileiro.',
    books: [makeBookSummary()],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<BookServiceDeps>): BookServiceDeps {
  return {
    findBooks: vi.fn().mockResolvedValue({ books: [], total: 0 }),
    findBookById: vi.fn().mockResolvedValue(null),
    findAuthorBySlug: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listBooks()
// ---------------------------------------------------------------------------

describe('listBooks()', () => {
  it('retorna lista paginada com defaults quando nenhum filtro é passado', async () => {
    const books = [makeBookSummary()];
    const deps = makeDeps({
      findBooks: vi.fn().mockResolvedValue({ books, total: 1 }),
    });

    const result = await listBooks({}, deps);

    expect(result.data).toEqual(books);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(20);
    expect(result.pagination.totalPages).toBe(1);
    expect(deps.findBooks).toHaveBeenCalledWith({
      search: undefined,
      genre: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it('encaminha filtro de busca e gênero', async () => {
    const deps = makeDeps();

    await listBooks({ search: 'Dom', genre: 'Romance', page: 2, pageSize: 10 }, deps);

    expect(deps.findBooks).toHaveBeenCalledWith({
      search: 'Dom',
      genre: 'Romance',
      page: 2,
      pageSize: 10,
    });
  });

  it('limita pageSize ao máximo de 100', async () => {
    const deps = makeDeps();

    await listBooks({ pageSize: 999 }, deps);

    expect(deps.findBooks).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 100 }),
    );
  });

  it('normaliza page < 1 para 1', async () => {
    const deps = makeDeps();

    await listBooks({ page: -5 }, deps);

    expect(deps.findBooks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it('remove espaços extras do search', async () => {
    const deps = makeDeps();

    await listBooks({ search: '  Dom  ' }, deps);

    expect(deps.findBooks).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Dom' }),
    );
  });

  it('omite search quando o valor é vazio (somente espaços)', async () => {
    const deps = makeDeps();

    await listBooks({ search: '   ' }, deps);

    const firstCall = (deps.findBooks as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall).toBeDefined();
    const calledWith = firstCall?.[0] as ListBooksFilter;
    expect(calledWith).not.toHaveProperty('search');
  });
});

// ---------------------------------------------------------------------------
// getBook()
// ---------------------------------------------------------------------------

describe('getBook()', () => {
  it('retorna BookDetail quando o Livro existe', async () => {
    const detail = makeBookDetail();
    const deps = makeDeps({
      findBookById: vi.fn().mockResolvedValue(detail),
    });

    const result = await getBook('book-1', deps);

    expect(result).toEqual(detail);
    expect(deps.findBookById).toHaveBeenCalledWith('book-1');
  });

  it('lança NOT_FOUND quando o Livro não existe', async () => {
    const deps = makeDeps({ findBookById: vi.fn().mockResolvedValue(null) });

    await expect(getBook('nao-existe', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getBook('nao-existe', deps)).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// getAuthor()
// ---------------------------------------------------------------------------

describe('getAuthor()', () => {
  it('retorna AuthorDetail quando o Autor existe', async () => {
    const author = makeAuthorDetail();
    const deps = makeDeps({
      findAuthorBySlug: vi.fn().mockResolvedValue(author),
    });

    const result = await getAuthor('machado-de-assis', deps);

    expect(result).toEqual(author);
    expect(deps.findAuthorBySlug).toHaveBeenCalledWith('machado-de-assis');
  });

  it('lança NOT_FOUND quando o Autor não existe', async () => {
    const deps = makeDeps({ findAuthorBySlug: vi.fn().mockResolvedValue(null) });

    await expect(getAuthor('nao-existe', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getAuthor('nao-existe', deps)).rejects.toBeInstanceOf(AppError);
  });

  it('retorna lista de Livros do Autor com Disponibilidade', async () => {
    const author = makeAuthorDetail({
      books: [
        makeBookSummary({ availableCopies: 2 }),
        makeBookSummary({ id: 'book-2', availableCopies: 0 }),
      ],
    });
    const deps = makeDeps({ findAuthorBySlug: vi.fn().mockResolvedValue(author) });

    const result = await getAuthor('machado-de-assis', deps);

    expect(result.books).toHaveLength(2);
    expect(result.books[0]?.availableCopies).toBe(2);
    expect(result.books[1]?.availableCopies).toBe(0);
  });
});
