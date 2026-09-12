/**
 * packages/api/src/domain/reservation/reservationService.ts
 * Casos de uso do domínio de Reserva — lógica pura, sem HTTP, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Casos de uso implementados:
 *   - createReservation       — cria Reserva se houver Cópia disponível (RF-L3, RN-1, RN-3, RN-4, RN-9, RN-10)
 *   - cancelReservation       — Leitor desiste da própria Reserva ativa (RF-L8, RN-11)
 *   - listReaderReservations  — lista Reservas ativas do Leitor (RF-L4)
 *   - listBookReservations    — lista todas as Reservas de um Livro (RF-B1)
 */

import { AppError } from '../../shared/errors.js';
import type {
  CancelReservationInput,
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

/**
 * RN-10: teto de Reservas ativas simultâneas por Leitor.
 *
 * Mora aqui, e não em `packages/web`, porque é regra que a API precisa impor: a
 * tela não pode ser a única guardiã de um limite que protege o acervo (issue
 * #29). `LOAN_PERIOD_DAYS` vive no cliente por ser o oposto — um padrão de
 * digitação que o Bibliotecário ajusta no balcão.
 *
 * Conta **apenas Reservas ativas**. Empréstimo em aberto não ocupa vaga: o PRD
 * não define teto de Empréstimo, e fazer este número valer para os dois criaria
 * um limite de retirada que ninguém pediu.
 */
export const MAX_ACTIVE_RESERVATIONS_PER_READER = 3;

// ---------------------------------------------------------------------------
// Tipos de dependência (port / secondary adapter interface)
// ---------------------------------------------------------------------------

/** Representa uma Cópia disponível retornada pelo repositório */
export interface AvailableCopy {
  id: string;
  code: string;
}

/** Dados mínimos de uma Reserva para decidir se ela pode ser cancelada (RN-11). */
export interface ReservationForCancel {
  id: string;
  userId: string;
  copyId: string;
  expiresAt: Date;
  convertedAt: Date | null;
  expiredAt: Date | null;
  cancelledAt: Date | null;
}

/** Resultado da transação de criação — ver `createReservationTx`. */
export type CreateReservationTxResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'copy_taken' | 'duplicate_book' | 'limit_reached' };

export interface ReservationServiceDeps {
  /** Retorna uma Cópia com status='available' para o Livro, ou null se não houver (RN-3) */
  findAvailableCopy: (bookId: string) => Promise<AvailableCopy | null>;

  /** Diz se o Livro existe no acervo — consultado só quando não há Cópia livre */
  bookExists: (bookId: string) => Promise<boolean>;

  /**
   * Persiste a nova Reserva e marca a Cópia como 'reserved' em uma única transação (RN-4).
   *
   * As três recusas moram **dentro** da transação de propósito. Contar Reservas
   * do lado de fora não protege nada: N requisições simultâneas do mesmo Leitor
   * leem o mesmo total e passam todas, e duas Reservas do mesmo Livro pegam
   * Cópias diferentes, então nem sequer disputam a mesma linha (issues #28, #29).
   *
   * - `copy_taken`     — a Cópia saiu entre findAvailableCopy e a escrita (RN-3)
   * - `duplicate_book` — o Leitor já tem este Livro reservado ou emprestado (RN-9)
   * - `limit_reached`  — o Leitor bateu o teto de Reservas ativas (RN-10)
   */
  createReservationTx: (params: {
    userId: string;
    bookId: string;
    copyId: string;
    expiresAt: Date;
    now: Date;
    maxActiveReservations: number;
  }) => Promise<CreateReservationTxResult>;

  /** Busca uma Reserva pelo id para decidir o cancelamento (RN-11); null se não existe */
  findReservationForCancel: (reservationId: string) => Promise<ReservationForCancel | null>;

  /**
   * Marca a Reserva como cancelada pelo Leitor e devolve a Cópia ao acervo em
   * uma única transação (RN-11, RN-5).
   *
   * O UPDATE é condicionado aos três desfechos ainda nulos, e é ele que decide o
   * vencedor: duas requisições concorrentes — o duplo clique da tela, ou o
   * cancelamento e o job de expiração no mesmo segundo — passam juntas pelas
   * checagens do serviço. Retorna false para quem não afetou linha nenhuma.
   */
  cancelReservationTx: (params: {
    reservationId: string;
    copyId: string;
    now: Date;
  }) => Promise<boolean>;

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
    // "Livro esgotado" e "Livro que não existe" são situações diferentes para quem
    // chama: uma é esperar a Cópia voltar, a outra é o id estar errado. A consulta
    // extra só acontece aqui, no caminho de erro — o caso de sucesso não paga por ela.
    if (!(await deps.bookExists(input.bookId))) {
      throw new AppError('NOT_FOUND', `Livro não encontrado: ${input.bookId}`);
    }
    throw new AppError(
      'NO_COPY_AVAILABLE',
      'Não há cópias disponíveis para este livro no momento.',
    );
  }

  // RN-1: expiração em 12h a partir do momento de criação
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  // RN-4: Cópia passa para 'reserved' atomicamente com a criação da Reserva.
  // RN-9 e RN-10 são decididas aqui dentro pelo mesmo motivo — ver o contrato
  // de `createReservationTx`.
  const created = await deps.createReservationTx({
    userId: input.userId,
    bookId: input.bookId,
    copyId: availableCopy.id,
    expiresAt,
    now,
    maxActiveReservations: MAX_ACTIVE_RESERVATIONS_PER_READER,
  });

  if (!created.ok) {
    switch (created.reason) {
      // RN-9: o Leitor já tem este Livro nas mãos, por Reserva ou Empréstimo.
      // Sem isto ele consumia quantas Cópias quisesse do mesmo título e zerava a
      // Disponibilidade de um Livro que o acervo tem em duplicata (issue #28).
      case 'duplicate_book':
        throw new AppError(
          'DUPLICATE_RESERVATION',
          'Você já tem uma reserva ativa ou um empréstimo em aberto deste livro.',
        );

      // RN-10: teto por Leitor (issue #29).
      case 'limit_reached':
        throw new AppError(
          'RESERVATION_LIMIT_REACHED',
          `Você já tem ${String(MAX_ACTIVE_RESERVATIONS_PER_READER)} reservas ativas, o máximo permitido. ` +
            'Retire ou aguarde a expiração de uma delas para reservar outro livro.',
        );

      // RN-3: a leitura de disponibilidade e a escrita não são o mesmo instante.
      // Sob concorrência, dois Leitores encontram a mesma Cópia livre e só um a
      // leva — o outro recebe a mesma resposta de quem tentou reservar sem Cópia
      // nenhuma.
      case 'copy_taken':
        throw new AppError(
          'NO_COPY_AVAILABLE',
          'Não há cópias disponíveis para este livro no momento.',
        );
    }
  }

  return {
    reservationId: created.reservationId,
    copyId: availableCopy.id,
    expiresAt: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// cancelReservation — RF-L8, RN-11, RN-5
// ---------------------------------------------------------------------------

/**
 * O Leitor desiste da própria Reserva antes do prazo, e a Cópia volta ao acervo
 * na hora.
 *
 * Sem isto a Reserva tinha duas saídas — conversão e as 12h de RN-1 — e nenhuma
 * delas nas mãos de quem reservou: a Cópia ficava bloqueada o prazo inteiro
 * mesmo quando o Leitor já sabia que não ia buscar. Quem pagava eram os outros
 * Leitores, que veem Disponibilidade zero num Livro que ninguém vai retirar
 * (issue #20).
 *
 * A ordem das recusas segue o que é mais informativo para quem clicou:
 * convertida (o Empréstimo já existe, o assunto agora é Devolução), cancelada
 * (idempotência — dois cliques não são dois cancelamentos) e só então o prazo.
 */
export async function cancelReservation(
  input: CancelReservationInput,
  deps: ReservationServiceDeps,
  now: Date = new Date(),
): Promise<void> {
  const reservation = await deps.findReservationForCancel(input.reservationId);

  // Reserva de outro Leitor responde como Reserva inexistente, de propósito: um
  // 403 aqui confirmaria a existência do id a quem não é dono, e a lista de
  // Reservas não é pública (P-01, ADR-0009). RN-11 — só o dono cancela.
  if (!reservation || reservation.userId !== input.userId) {
    throw new AppError('NOT_FOUND', 'Reserva não encontrada.');
  }

  if (reservation.convertedAt !== null) {
    throw new AppError(
      'CONFLICT',
      'Esta reserva já virou empréstimo e não pode ser cancelada. Procure o balcão para devolver o livro.',
    );
  }

  if (reservation.cancelledAt !== null) {
    throw new AppError('CONFLICT', 'Esta reserva já foi cancelada.');
  }

  // Prazo vencido é o caso comum de erro aqui: a aba ficou aberta, o prazo correu
  // e o botão continuou na tela. `expiredAt` preenchido é o job já tendo passado;
  // a comparação de prazo cobre a janela de até 60 s antes disso, para que a
  // resposta não dependa de o job ter rodado (RN-1).
  if (reservation.expiredAt !== null || reservation.expiresAt <= now) {
    throw new AppError(
      'RESERVATION_EXPIRED',
      'Esta reserva expirou e a cópia já voltou ao acervo — não há o que cancelar.',
    );
  }

  // RN-5: a Cópia volta ao acervo na mesma transação que encerra a Reserva.
  const cancelled = await deps.cancelReservationTx({
    reservationId: reservation.id,
    copyId: reservation.copyId,
    now,
  });

  // Corrida perdida: entre as checagens acima e a escrita, outra requisição (ou o
  // job de expiração) deu o desfecho. Para quem clicou é a mesma situação de uma
  // Reserva já encerrada, e é o que a mensagem diz.
  if (!cancelled) {
    throw new AppError('CONFLICT', 'Esta reserva já foi encerrada.');
  }
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
