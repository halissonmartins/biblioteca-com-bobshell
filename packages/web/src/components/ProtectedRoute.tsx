import { Navigate, Outlet, useLocation } from 'react-router-dom'
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
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  // Restaurar a sessão do Keycloak e buscar o perfil leva um instante. Decidir
  // antes disso mandaria quem já entrou de volta para /login — que reencaminha
  // ao Keycloak, que devolve autenticado: um laço de redirect.
  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    // A rota tentada viaja junto para que o login devolva a pessoa aqui
    // (docs/design/fluxos.md), e não sempre no Catálogo.
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    )
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
