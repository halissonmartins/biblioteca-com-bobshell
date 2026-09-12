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
  /**
   * Status derivado — nunca persiste como campo separado.
   *
   * `expired` e `cancelled` são desfechos diferentes e não se confundem desde
   * RF-L8: o prazo passou, ou o Leitor desistiu. Para o balcão a distinção é
   * operacional — uma Cópia que voltou por desistência voltou mais cedo.
   */
  status: 'active' | 'expired' | 'converted' | 'cancelled';
  convertedAt: string | null;  // ISO 8601
  expiredAt: string | null;    // ISO 8601 — gravado pelo job (RN-1, RN-5)
  cancelledAt: string | null;  // ISO 8601 — gravado pelo Leitor (RF-L8, RN-11)
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
// Input para cancelamento de Reserva (RF-L8, RN-11)
// ---------------------------------------------------------------------------

/** Dados necessários para o Leitor cancelar a própria Reserva */
export interface CancelReservationInput {
  /** Reserva a cancelar */
  reservationId: string;
  /**
   * Leitor autenticado. Não é filtro de conveniência: RN-11 diz que só o dono
   * cancela, e o id vem do token, nunca do corpo (ADR-0009).
   */
  userId: string;
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
