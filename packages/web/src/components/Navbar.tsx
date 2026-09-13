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
 *
 * O trilho só vira coluna lateral a partir de `xl` (1280px). Em 1024px — tablet
 * em paisagem — os 240px fixos comiam um quarto da tela e sobravam 734px para a
 * tabela do balcão, que pede 740: a lateral tomava justamente a largura que a
 * coluna de ação precisava. Até lá o trilho é a placa de duas linhas no topo,
 * que custa altura (barata) em vez de largura (escassa).
 */
export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const links = zonas(user?.role, isAuthenticated)

  // O contorno do botão fica fora da chapa, sobre o oxblood: grafite ali mede
  // 1,7:1 e o foco não se via. Branco, como o do resto do trilho.
  const focoNoTrilho = 'focus-visible:outline-surface-0'
  const acoes = isAuthenticated ? (
    <Button variant="secondary" size="sm" className={focoNoTrilho} onClick={handleLogout}>
      Sair
    </Button>
  ) : (
    <Button variant="secondary" size="sm" className={focoNoTrilho} onClick={() => navigate('/login')}>
      Entrar
    </Button>
  )

  return (
    <header className="zona-rail sticky top-0 z-40 xl:fixed xl:inset-y-0 xl:left-0 xl:w-60 xl:flex xl:flex-col">
      {/* Abaixo de xl o trilho é uma placa de duas linhas: identificação em cima,
          zonas embaixo em faixa própria. Espremer tudo numa linha cortava o
          rótulo da última zona atrás do botão, e um rótulo cortado lê como
          defeito, não como conteúdo rolável. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 xl:py-6 xl:px-4">
        <Link
          to="/"
          className="inline-flex items-center min-h-[44px] shrink-0
                     font-display text-xl xl:text-2xl font-bold uppercase tracking-placa text-surface-0
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-0"
        >
          Biblioteca
        </Link>
        <div className="shrink-0 xl:hidden">{acoes}</div>
      </div>

      <nav
        className="flex items-stretch overflow-x-auto border-t border-surface-0/15
                   xl:flex-col xl:flex-1 xl:overflow-visible xl:border-t-0"
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

      <div className="hidden xl:flex xl:flex-col xl:gap-3 xl:px-4 xl:py-5 xl:border-t xl:border-surface-0/20">
        {isAuthenticated && <span className="legenda text-surface-0/70">{user?.name}</span>}
        {acoes}
      </div>
    </header>
  )
}
