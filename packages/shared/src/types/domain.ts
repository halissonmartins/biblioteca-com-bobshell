/**
 * Tipos de domínio — espelho TypeScript do schema.prisma
 * Usar exatamente os termos do glossario.md
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type Role = 'leitor' | 'bibliotecario';

/** Estados do ciclo de vida de uma Cópia (glossario.md) */
export type CopyStatus = 'available' | 'reserved' | 'loaned';

// ---------------------------------------------------------------------------
// Entidades de domínio (subconjunto seguro — sem campos sensíveis)
// ---------------------------------------------------------------------------

export interface Author {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  createdAt: string; // ISO 8601
}

export interface Book {
  id: string;
  isbn: string;
  title: string;
  synopsis: string | null;
  genre: string;
  coverUrl: string | null;
  publishedAt: string | null; // ISO 8601
  authorId: string;
  createdAt: string;
}

export interface Copy {
  id: string;
  code: string;
  status: CopyStatus;
  bookId: string;
}

/** Usuário sem passwordHash — seguro para enviar ao cliente */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  address: string | null;
  createdAt: string;
}

export interface Reservation {
  id: string;
  expiresAt: string; // ISO 8601
  convertedAt: string | null;
  cancelledAt: string | null;
  copyId: string;
  userId: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  dueAt: string; // ISO 8601
  returnedAt: string | null;
  copyId: string;
  userId: string;
  reservationId: string;
  librarianId: string;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number; // 1–5
  text: string;
  bookId: string;
  userId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Agregados — composições usadas nas respostas da API
// ---------------------------------------------------------------------------

/** Detalhes de um Livro com disponibilidade e avaliações recentes (RF-L2, RNF-1) */
export interface BookDetail extends Book {
  author: Author;
  availableCopies: number;
  recentReviews: ReviewWithUser[];
}

export interface ReviewWithUser extends Review {
  user: Pick<User, 'id' | 'name'>;
}

/**
 * Status derivado de uma Reserva, calculado pela API a cada leitura.
 * Nunca persiste como campo — ver reservationRepository.
 */
export type ReservationStatus = 'active' | 'expired' | 'converted' | 'cancelled';

/** Reserva com dados do livro e cópia (para o Leitor e para o Bibliotecário) */
export interface ReservationDetail extends Reservation {
  copy: Copy & { book: Book & { author: Pick<Author, 'id' | 'name'> } };
  user: Pick<User, 'id' | 'name' | 'email'>;
  /**
   * Fonte da verdade do estado — o cliente só envelhece 'active' entre refetches.
   *
   * Opcional porque `/me/reservations` não o envia: aquela rota já filtra no
   * banco (expiresAt > now, convertedAt e cancelledAt nulos) e devolve apenas
   * Reservas ativas. Ausência de status ali significa "ativa", não "desconhecido".
   */
  status?: ReservationStatus;
}

/** Empréstimo com dados do livro, cópia e leitor */
export interface LoanDetail extends Loan {
  copy: Copy & { book: Book & { author: Pick<Author, 'id' | 'name'> } };
  user: Pick<User, 'id' | 'name' | 'email'>;
  librarian: Pick<User, 'id' | 'name'>;
}

/** Item do catálogo (listagem paginada — RF-L1) */
export interface BookListItem {
  id: string;
  isbn: string;
  title: string;
  genre: string;
  coverUrl: string | null;
  author: Pick<Author, 'id' | 'name' | 'slug'>;
  availableCopies: number;
}
