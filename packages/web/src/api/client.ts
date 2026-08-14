/**
 * HTTP client base — todas as chamadas passam por aqui.
 * Injeta Authorization header e trata erros de envelope.
 */

import type { ApiError } from '../../../shared/src/types/api'

export type ApiRequestError = {
  readonly name: 'ApiRequestError'
  readonly code: string
  readonly message: string
  readonly status: number
}

/** Creates an ApiRequestError value */
export function makeApiRequestError(code: string, message: string, status: number): ApiRequestError {
  return { name: 'ApiRequestError', code, message, status }
}

/** Type guard */
export function isApiRequestError(err: unknown): err is ApiRequestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>)['name'] === 'ApiRequestError'
  )
}

/** Throws an ApiRequestError (as a plain object tagged as Error-compatible) */
function throwApiError(code: string, message: string, status: number): never {
  const err = Object.assign(new Error(message), { name: 'ApiRequestError', code, status }) as unknown as ApiRequestError & Error
  throw err
}

/** Returns the access token stored in sessionStorage */
function getToken(): string | null {
  return sessionStorage.getItem('access_token')
}

/** Stores the access token in sessionStorage */
export function setToken(token: string): void {
  sessionStorage.setItem('access_token', token)
}

/** Removes the access token */
export function clearToken(): void {
  sessionStorage.removeItem('access_token')
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`/api${path}`, { ...init, headers })

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR'
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as ApiError
      code = body.error.code
      message = body.error.message
    } catch {
      // ignore json parse failure
    }
    throwApiError(code, message, res.status)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}
