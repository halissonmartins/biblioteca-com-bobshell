import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthHook'
import type { Role } from '../../../shared/src/types/domain'

interface ProtectedRouteProps {
  requiredRole?: Role
}

/**
 * Guard de rota: redireciona para /login se não autenticado.
 * Se requiredRole for passado, redireciona para / se o papel não bater.
 */
export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
