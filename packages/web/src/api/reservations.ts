import { request } from './client'
import type {
  ApiSuccess,
  CancelReservationResponse,
  CreateReservationRequest,
  CreateReservationResponse,
} from '../../../shared/src/types/api'
import type { ReservationDetail } from '../../../shared/src/types/domain'

export async function createReservation(body: CreateReservationRequest): Promise<ReservationDetail> {
  const res = await request<ApiSuccess<CreateReservationResponse>>('/reservations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data.reservation
}

/**
 * O Leitor desiste da própria Reserva e a Cópia volta ao acervo (RF-L8, RN-11).
 *
 * Devolve a Reserva já encerrada, não vazio: a tela troca o rótulo da linha com
 * a resposta em mãos, sem depender do refetch da lista chegar primeiro.
 */
export async function cancelReservation(reservationId: string): Promise<ReservationDetail> {
  const res = await request<ApiSuccess<CancelReservationResponse>>(
    `/reservations/${reservationId}/cancel`,
    { method: 'PATCH' },
  )
  return res.data.reservation
}

export async function getMyReservations(): Promise<ReservationDetail[]> {
  const res = await request<ApiSuccess<ReservationDetail[]>>('/me/reservations')
  return res.data
}

export async function getBookReservations(bookId: string): Promise<ReservationDetail[]> {
  const res = await request<ApiSuccess<ReservationDetail[]>>(`/books/${bookId}/reservations`)
  return res.data
}

export async function getAllReservations(userId?: string): Promise<ReservationDetail[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : ''
  const res = await request<ApiSuccess<ReservationDetail[]>>(`/reservations${qs}`)
  return res.data
}
