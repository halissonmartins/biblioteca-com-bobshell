/**
 * packages/api/src/domain/reservation/reservationService.ts
 * Casos de uso do domínio de Reserva — lógica pura, sem HTTP, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Casos de uso implementados:
 *   - createReservation       — cria Reserva se houver Cópia disponível (RF-L3, RN-1, RN-3, RN-4)
 *   - listReaderReservations  — lista Reservas ativas do Leitor (RF-L4)
 *   - listBookReservations    — lista todas as Reservas de um Livro (RF-B1)
 */

import { AppError } from '../../shared/errors.js';
import type {
  CreateReservationInput,
  CreateReservationResult,
  ListBookReservationsFilter,
  ListReaderReservationsFilter,
  ReservationDetail,
  ReservationSummary,
} from './reservationTypes.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** RN-1: Reserva expira 12 horas após a criação */
const RESERVATION_TTL_MS = 12 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Tipos de dependência (port / secondary adapter interface)
// ---------------------------------------------------------------------------

/** Representa uma Cópia disponível retornada pelo repositório */
export interface AvailableCopy {
  id: string;
  code: string;
}

export interface ReservationServiceDeps {
  /** Retorna uma Cópia com status='available' para o Livro, ou null se não houver (RN-3) */
  findAvailableCopy: (bookId: string) => Promise<AvailableCopy | null>;

  /** Persiste a nova Reserva e marca a Cópia como 'reserved' em uma única transação (RN-4) */
  createReservationTx: (params: {
    userId: string;
    copyId: string;
    expiresAt: Date;
  }) => Promise<{ reservationId: string }>;

  /** Lista as Reservas ativas (não expiradas) do Leitor (RF-L4) */
  findActiveReservationsByUser: (
    filter: ListReaderReservationsFilter,
  ) => Promise<ReservationSummary[]>;

  /** Lista todas as Reservas de um Livro, ativas e encerradas (RF-B1) */
  findReservationsByBook: (
    filter: ListBookReservationsFilter,
  ) => Promise<ReservationDetail[]>;
}

// ---------------------------------------------------------------------------
// createReservation — RF-L3, RN-1, RN-3, RN-4
// ---------------------------------------------------------------------------

export async function createReservation(
  input: CreateReservationInput,
  deps: ReservationServiceDeps,
  now: Date = new Date(),
): Promise<CreateReservationResult> {
  // RN-3: só reservar se houver Cópia disponível
  const availableCopy = await deps.findAvailableCopy(input.bookId);
  if (!availableCopy) {
    throw new AppError(
      'NO_COPY_AVAILABLE',
      'Não há cópias disponíveis para este livro no momento.',
    );
  }

  // RN-1: expiração em 12h a partir do momento de criação
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  // RN-4: Cópia passa para 'reserved' atomicamente com a criação da Reserva
  const { reservationId } = await deps.createReservationTx({
    userId: input.userId,
    copyId: availableCopy.id,
    expiresAt,
  });

  return {
    reservationId,
    copyId: availableCopy.id,
    expiresAt: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// listReaderReservations — RF-L4
// ---------------------------------------------------------------------------

export async function listReaderReservations(
  filter: ListReaderReservationsFilter,
  deps: ReservationServiceDeps,
): Promise<ReservationSummary[]> {
  return deps.findActiveReservationsByUser(filter);
}

// ---------------------------------------------------------------------------
// listBookReservations — RF-B1
// ---------------------------------------------------------------------------

export async function listBookReservations(
  filter: ListBookReservationsFilter,
  deps: ReservationServiceDeps,
): Promise<ReservationDetail[]> {
  return deps.findReservationsByBook(filter);
}
