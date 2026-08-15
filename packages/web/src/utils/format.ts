import type { ReservationStatus } from '../../../shared/src/types/domain'

/** Formata data ISO 8601 para dd/MM/yyyy HH:mm (fuso local) */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Formata data ISO 8601 para dd/MM/yyyy */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Disponibilidade de um Livro em texto (glossario.md: contagem de Cópias).
 * Existe para que catálogo e detalhe não divirjam — o template inline anterior
 * gerava "disponíveleis" em toda a base.
 */
export function formatAvailableCopies(count: number): string {
  return count === 1 ? '1 cópia disponível' : `${count} cópias disponíveis`
}

/** Estados de Reserva que a interface sabe exibir (glossario.md) */
export type ReservationState = 'ativa' | 'convertida' | 'expirada'

/** Campos que determinam o estado exibido de uma Reserva */
export interface ReservationLike {
  /** Ausente em `/me/reservations`, que já devolve somente Reservas ativas */
  status?: ReservationStatus
  expiresAt: string
}

/**
 * Tradução do status da API para o rótulo exibido.
 *
 * `cancelled` cai em 'expirada' de propósito: `expireReservationsTx` grava
 * `cancelledAt` para registrar a expiração (RN-1) e o produto ainda não tem
 * cancelamento pelo Leitor — hoje todo `cancelled` É uma expiração. Quando o
 * cancelamento existir, este mapa ganha o quarto rótulo.
 */
const STATE_BY_STATUS: Record<ReservationStatus, ReservationState> = {
  active:    'ativa',
  converted: 'convertida',
  expired:   'expirada',
  cancelled: 'expirada',
}

/** RN-1: limiar a partir do qual uma Reserva ativa entra em contagem regressiva visível */
export const EXPIRING_SOON_MS = 60 * 60 * 1_000

/**
 * Estado exibido da Reserva. O servidor é a fonte da verdade; o cliente apenas
 * envelhece 'ativa' → 'expirada' entre um refetch e outro, para que uma aba
 * aberta não continue anunciando como viva uma Reserva cujo prazo já passou.
 *
 * Uma Reserva convertida em Empréstimo é um sucesso e nunca aparece como
 * expirada — era essa a afirmação falsa que o Bibliotecário lia após cada
 * operação bem-sucedida.
 */
export function reservationState(r: ReservationLike, now: Date = new Date()): ReservationState {
  const state = r.status ? STATE_BY_STATUS[r.status] : 'ativa'
  if (state !== 'ativa') return state
  return new Date(r.expiresAt) > now ? 'ativa' : 'expirada'
}

/** Reserva ativa (não expirada, não cancelada, não convertida) */
export function isReservationActive(r: ReservationLike, now: Date = new Date()): boolean {
  return reservationState(r, now) === 'ativa'
}

/** Reserva ativa a menos de EXPIRING_SOON_MS do prazo */
export function isExpiringSoon(r: ReservationLike, now: Date = new Date()): boolean {
  if (!isReservationActive(r, now)) return false
  return new Date(r.expiresAt).getTime() - now.getTime() <= EXPIRING_SOON_MS
}

/**
 * Distância até um instante, em linguagem de balcão: "11 h 51 min", "47 min".
 * Sem sinal — quem chama diz se falta ou se passou.
 */
export function formatDuration(fromIso: string, now: Date = new Date()): string {
  const totalMinutes = Math.max(0, Math.round(Math.abs(new Date(fromIso).getTime() - now.getTime()) / 60_000))
  const days = Math.floor(totalMinutes / 1_440)
  if (days >= 1) return `${days} d`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours >= 1 ? `${hours} h ${minutes} min` : `${minutes} min`
}

/** Retorna a mensagem de erro amigável de um ApiRequestError genérico */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Ocorreu um erro inesperado.'
}
