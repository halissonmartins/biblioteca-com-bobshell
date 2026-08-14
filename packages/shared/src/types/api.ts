/**
 * Tipos das respostas e requests da API REST
 * Espelha o contrato definido em docs/openapi.yaml
 */

// ---------------------------------------------------------------------------
// Envelope padrão
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Auth — POST /auth/login, POST /auth/refresh, POST /auth/logout
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: import('./domain.js').User;
  /** Access token (15 min) — devolvido no corpo; também setado em cookie httpOnly */
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Livros — GET /books, GET /books/:id
// ---------------------------------------------------------------------------

export interface ListBooksQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  genre?: string;
  authorId?: string;
}

// ---------------------------------------------------------------------------
// Reservas — POST /reservations, GET /me/reservations
// ---------------------------------------------------------------------------

export interface CreateReservationRequest {
  bookId: string;
}

export interface CreateReservationResponse {
  reservation: import('./domain.js').ReservationDetail;
}

// ---------------------------------------------------------------------------
// Empréstimos — POST /loans, PATCH /loans/:id/return
// ---------------------------------------------------------------------------

export interface CreateLoanRequest {
  reservationId: string;
  dueAt: string; // ISO 8601
}

export interface ReturnLoanResponse {
  loan: import('./domain.js').LoanDetail;
}

// ---------------------------------------------------------------------------
// Avaliações — POST /books/:bookId/reviews
// ---------------------------------------------------------------------------

export interface CreateReviewRequest {
  rating: number; // 1–5
  text: string;
}
