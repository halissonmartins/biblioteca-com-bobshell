/**
 * AuthContext — definição do contexto de autenticação.
 * Separado para garantir fast-refresh do Vite (apenas exports não-componentes).
 */
import { createContext } from 'react'
import type { LoginRequest } from '../../../shared/src/types/api'
import type { User } from '../../../shared/src/types/domain'

export interface AuthContextValue {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (req: LoginRequest) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
