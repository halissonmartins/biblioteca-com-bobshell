import { request } from './client'
import type { ApiSuccess, CreateReservationRequest, CreateReservationResponse } from '../../../shared/src/types/api'
import type { ReservationDetail } from '../../../shared/src/types/domain'

export async function createReservation(body: CreateReservationRequest): Promise<ReservationDetail> {
  const res = await request<ApiSuccess<CreateReservationResponse>>('/reservations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
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
