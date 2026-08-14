/**
 * packages/api/src/domain/reservation/reservationTypes.ts
 * Tipos de domínio para Reserva.
 * NÃO importar nada de infra/, api/ nem de bibliotecas HTTP/banco.
 * Terminologia segue docs/produto/glossario.md estritamente.
 */

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------

/** Projeção usada na listagem de reservas do Leitor (RF-L4) */
export interface ReservationSummary {
  id: string;
  expiresAt: string;   // ISO 8601
  createdAt: string;   // ISO 8601
  copy: {
    id: string;
    code: string;
    book: {
      id: string;
      title: string;
      coverUrl: string | null;
      author: {
        id: string;
        name: string;
      };
    };
  };
}

/** Projeção usada na listagem do Bibliotecário (RF-B1) */
export interface ReservationDetail extends ReservationSummary {
  user: {
    id: string;
    name: string;
    email: string;
  };
  /** Status derivado — nunca persiste como campo separado */
  status: 'active' | 'expired' | 'converted' | 'cancelled';
  convertedAt: string | null;  // ISO 8601
  cancelledAt: string | null;  // ISO 8601
}

// ---------------------------------------------------------------------------
// Input para criação de Reserva
// ---------------------------------------------------------------------------

/** Dados necessários para criar uma Reserva (RF-L3) */
export interface CreateReservationInput {
  /** ID do Leitor autenticado */
  userId: string;
  /** ID do Livro que o Leitor quer reservar */
  bookId: string;
}

/** Resultado da criação de Reserva */
export interface CreateReservationResult {
  reservationId: string;
  copyId: string;
  expiresAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export interface ListReaderReservationsFilter {
  userId: string;
}

export interface ListBookReservationsFilter {
  bookId: string;
}
