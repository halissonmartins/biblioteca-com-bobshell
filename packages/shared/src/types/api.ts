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
// Identidade — GET /me
//
// Não há tipo de login: a API não recebe credencial nem emite token. Quem
// autentica é o Keycloak (ADR-0009), e `GET /me` devolve o `User` de domain.ts.
// ---------------------------------------------------------------------------

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
