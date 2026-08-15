import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthHook'
import { Button } from '@/components'

interface Zona {
  to: string
  label: string
  /** Só a raiz precisa de correspondência exata; as demais são folhas */
  end?: boolean
}

function zonas(role: string | undefined, isAuthenticated: boolean): Zona[] {
  const catalogo: Zona[] = [{ to: '/', label: 'Catálogo', end: true }]
  if (!isAuthenticated) return catalogo
  if (role === 'bibliotecario') {
    return [
      ...catalogo,
      { to: '/bibliotecario/reservas', label: 'Reservas' },
      { to: '/bibliotecario/emprestimos', label: 'Empréstimos' },
    ]
  }
  return [
    ...catalogo,
    { to: '/minhas-reservas', label: 'Minhas Reservas' },
    { to: '/meus-emprestimos', label: 'Meus Empréstimos' },
  ]
}

/**
 * Trilho de zona — a placa esmaltada que diz em que parte do prédio você está.
 *
 * O estado ativo é inversão, como numa placa acesa: a zona atual imprime clara
 * sobre o oxblood com o filete cromo à esquerda. Sem `aria-current` a interface
 * não dizia em nenhum lugar onde o usuário estava.
 */
export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const links = zonas(user?.role, isAuthenticated)

  const acoes = isAuthenticated ? (
    <Button variant="secondary" size="sm" onClick={handleLogout}>
      Sair
    </Button>
  ) : (
    <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>
      Entrar
    </Button>
  )

  return (
    <header className="zona-rail sticky top-0 z-40 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:flex lg:flex-col">
      {/* No mobile o trilho é uma placa de duas linhas: identificação em cima,
          zonas embaixo em faixa própria. Espremer tudo numa linha cortava o
          rótulo da última zona atrás do botão, e um rótulo cortado lê como
          defeito, não como conteúdo rolável. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:py-6 lg:px-4">
        <Link
          to="/"
          className="font-display text-xl lg:text-2xl font-bold uppercase tracking-placa text-surface-0 shrink-0
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-0"
        >
          Biblioteca
        </Link>
        <div className="shrink-0 lg:hidden">{acoes}</div>
      </div>

      <nav
        className="flex items-stretch overflow-x-auto border-t border-surface-0/15
                   lg:flex-col lg:flex-1 lg:overflow-visible lg:border-t-0"
        aria-label="Zonas do acervo"
      >
        {links.map((zona) => (
          <NavLink
            key={zona.to}
            to={zona.to}
            end={zona.end}
            className={({ isActive }) => (isActive ? 'zona-link-ativo' : 'zona-link')}
          >
            {zona.label}
          </NavLink>
        ))}
      </nav>

      <div className="hidden lg:flex lg:flex-col lg:gap-3 lg:px-4 lg:py-5 lg:border-t lg:border-surface-0/20">
        {isAuthenticated && <span className="legenda text-surface-0/70">{user?.name}</span>}
        {acoes}
      </div>
    </header>
  )
}
