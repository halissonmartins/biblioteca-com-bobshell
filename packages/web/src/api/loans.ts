import { request } from './client'
import type { ApiSuccess, CreateLoanRequest, ReturnLoanResponse } from '../../../shared/src/types/api'
import type { LoanDetail } from '../../../shared/src/types/domain'

export async function createLoan(body: CreateLoanRequest): Promise<LoanDetail> {
  const res = await request<ApiSuccess<{ loan: LoanDetail }>>('/loans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data.loan
}

export async function returnLoan(loanId: string): Promise<LoanDetail> {
  const res = await request<ApiSuccess<ReturnLoanResponse>>(`/loans/${loanId}/return`, {
    method: 'PATCH',
  })
  return res.data.loan
}

export async function getMyLoans(): Promise<LoanDetail[]> {
  const res = await request<ApiSuccess<LoanDetail[]>>('/me/loans')
  return res.data
}

export async function getAllLoans(userId?: string): Promise<LoanDetail[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : ''
  const res = await request<ApiSuccess<LoanDetail[]>>(`/loans${qs}`)
  return res.data
}
