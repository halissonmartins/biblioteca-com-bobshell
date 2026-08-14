/**
 * packages/api/src/domain/book/bookTypes.ts
 * Tipos de domínio para Livro, Autor, Cópia e Avaliação.
 * NÃO importar nada de infra/, api/ nem de bibliotecas HTTP/banco.
 * Terminologia segue docs/produto/glossario.md estritamente.
 */

// ---------------------------------------------------------------------------
// Autor
// ---------------------------------------------------------------------------

export interface AuthorSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AuthorDetail extends AuthorSummary {
  bio: string | null;
  books: BookSummary[];
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

export interface ReviewSummary {
  id: string;
  rating: number;
  text: string;
  userName: string;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Livro
// ---------------------------------------------------------------------------

/** Projeção usada na listagem do Catálogo (RF-L1) */
export interface BookSummary {
  id: string;
  isbn: string;
  title: string;
  genre: string;
  coverUrl: string | null;
  author: AuthorSummary;
  /** Número de Cópias com status 'available' no momento (RN-3) */
  availableCopies: number;
}

/** Projeção completa usada na página de detalhes (RF-L2) */
export interface BookDetail extends BookSummary {
  synopsis: string | null;
  publishedAt: string | null; // ISO 8601
  /** 5 avaliações mais recentes (PRD §8) */
  recentReviews: ReviewSummary[];
}

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export interface ListBooksFilter {
  /** Busca por título ou nome do autor (US-01) */
  search?: string | undefined;
  genre?: string | undefined;
  page: number;
  pageSize: number;
}
