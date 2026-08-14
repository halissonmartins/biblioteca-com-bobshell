/**
 * AuthProvider — provedor de autenticação global.
 * Wraps o login/logout e persiste o user no sessionStorage.
 */
import { useState, useCallback, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout } from '@/api/auth'
import type { User } from '../../../shared/src/types/domain'
import type { LoginRequest } from '../../../shared/src/types/api'
import { AuthContext } from './authContext'

interface AuthState {
  user: User | null
  accessToken: string | null
}

function loadStoredAuth(): AuthState {
  try {
    const raw = sessionStorage.getItem('auth_user')
    const token = sessionStorage.getItem('access_token')
    if (raw && token) {
      return { user: JSON.parse(raw) as User, accessToken: token }
    }
  } catch {
    // ignore
  }
  return { user: null, accessToken: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadStoredAuth)

  const login = useCallback(async (req: LoginRequest) => {
    const res = await apiLogin(req)
    sessionStorage.setItem('auth_user', JSON.stringify(res.user))
    sessionStorage.setItem('access_token', res.accessToken)
    setState({ user: res.user, accessToken: res.accessToken })
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    sessionStorage.removeItem('auth_user')
    sessionStorage.removeItem('access_token')
    setState({ user: null, accessToken: null })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isAuthenticated: state.user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
