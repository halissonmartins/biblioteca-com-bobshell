import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components'

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="bg-surface-0 border-b border-surface-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="text-lg font-semibold text-surface-900 hover:text-primary-600 transition-colors">
          📚 Biblioteca
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1" aria-label="Navegação principal">
          <Link
            to="/"
            className="px-3 py-1.5 rounded text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-900 transition-colors"
          >
            Catálogo
          </Link>

          {isAuthenticated && user?.role === 'leitor' && (
            <>
              <Link
                to="/minhas-reservas"
                className="px-3 py-1.5 rounded text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-900 transition-colors"
              >
                Minhas Reservas
              </Link>
              <Link
                to="/meus-emprestimos"
                className="px-3 py-1.5 rounded text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-900 transition-colors"
              >
                Meus Empréstimos
              </Link>
            </>
          )}

          {isAuthenticated && user?.role === 'bibliotecario' && (
            <>
              <Link
                to="/bibliotecario/reservas"
                className="px-3 py-1.5 rounded text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-900 transition-colors"
              >
                Reservas
              </Link>
              <Link
                to="/bibliotecario/emprestimos"
                className="px-3 py-1.5 rounded text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-900 transition-colors"
              >
                Empréstimos
              </Link>
            </>
          )}
        </nav>

        {/* User actions */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="text-xs text-surface-700 hidden sm:block">
                {user?.name}
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => navigate('/login')}>
              Entrar
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
