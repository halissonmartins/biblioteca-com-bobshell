/**
 * packages/api/src/infra/repositories/authorRepository.ts
 * ÚNICO ponto de acesso à tabela `authors` via Prisma.
 * Sem regras de negócio — apenas leitura de dados.
 *
 * Terminologia segue docs/produto/glossario.md (Autor, Livro, Disponibilidade).
 */

import { prisma } from '../prisma.js';
import type { AuthorDetail } from '../../domain/book/bookTypes.js';

// ---------------------------------------------------------------------------
// findAuthorBySlug — para getAuthor() (RF-L6, US-06)
// ---------------------------------------------------------------------------

export async function findAuthorBySlug(slug: string): Promise<AuthorDetail | null> {
  const row = await prisma.author.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      books: {
        orderBy: { title: 'asc' },
        select: {
          id: true,
          isbn: true,
          title: true,
          genre: true,
          coverUrl: true,
          // Disponibilidade atual de cada Livro do Autor (US-06)
          _count: {
            select: {
              copies: {
                where: { status: 'available' },
              },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    books: row.books.map((b) => ({
      id: b.id,
      isbn: b.isbn,
      title: b.title,
      genre: b.genre,
      coverUrl: b.coverUrl,
      author: { id: row.id, name: row.name, slug: row.slug },
      availableCopies: b._count.copies,
    })),
  };
}
