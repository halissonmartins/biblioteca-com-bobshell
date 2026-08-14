/**
 * packages/api/src/domain/loan/loanTypes.ts
 * Tipos de domínio para Empréstimo e Devolução.
 * NÃO importar nada de infra/, api/ nem de bibliotecas HTTP/banco.
 * Terminologia segue docs/produto/glossario.md estritamente.
 */

// ---------------------------------------------------------------------------
// Empréstimo
// ---------------------------------------------------------------------------

/** Projeção usada na listagem de Empréstimos (RF-L5, RF-B2, RF-B3) */
export interface LoanSummary {
  id: string;
  dueAt: string;       // ISO 8601
  returnedAt: string | null; // null enquanto em aberto
  createdAt: string;   // ISO 8601
  copy: {
    id: string;
    code: string;
    book: {
      id: string;
      title: string;
      coverUrl: string | null;
    };
  };
  reader: {
    id: string;
    name: string;
    email: string;
  };
  librarian: {
    id: string;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// Input para criação de Empréstimo
// ---------------------------------------------------------------------------

/**
 * Dados necessários para efetivar um Empréstimo (RF-B4).
 * Quem chama deve garantir que librarianId corresponde a um bibliotecário (RN-7) —
 * essa verificação é responsabilidade do middleware de autorização.
 */
export interface CreateLoanInput {
  /** ID da Reserva ativa que origina este Empréstimo (RN-6) */
  reservationId: string;
  /** ID do Bibliotecário que está efetivando o empréstimo (RN-2, RN-7) */
  librarianId: string;
  /** Data de vencimento combinada no balcão */
  dueAt: Date;
}

/** Resultado da criação de Empréstimo */
export interface CreateLoanResult {
  loanId: string;
  copyId: string;
  dueAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Input para Devolução
// ---------------------------------------------------------------------------

/** Dados necessários para registrar uma Devolução (RF-B5) */
export interface ReturnLoanInput {
  /** ID do Empréstimo que está sendo devolvido */
  loanId: string;
  /** ID do Bibliotecário que registra a devolução (RN-7) */
  librarianId: string;
}

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export interface ListLoansFilter {
  /** Filtrar por Leitor (RF-B3, RF-L5) */
  userId?: string;
  /** Se true, retorna apenas Empréstimos em aberto (returnedAt IS NULL) */
  onlyActive?: boolean;
}
