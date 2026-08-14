import { request, setToken, clearToken } from './client'
import type { LoginRequest, LoginResponse } from '../../../shared/src/types/api'
import type { ApiSuccess } from '../../../shared/src/types/api'

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const res = await request<ApiSuccess<LoginResponse>>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  setToken(res.data.accessToken)
  return res.data
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' })
  } finally {
    clearToken()
  }
}

export async function refreshToken(): Promise<string> {
  const res = await request<ApiSuccess<{ accessToken: string }>>('/auth/refresh', { method: 'POST' })
  setToken(res.data.accessToken)
  return res.data.accessToken
}
