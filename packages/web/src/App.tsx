import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage }                    from '@/pages/LoginPage'
import { CatalogoPage }                 from '@/pages/CatalogoPage'
import { DetalhesLivroPage }            from '@/pages/DetalhesLivroPage'
import { MinhasReservasPage }           from '@/pages/MinhasReservasPage'
import { MeusEmprestimosPage }          from '@/pages/MeusEmprestimosPage'
import { DetalhesAutorPage }            from '@/pages/DetalhesAutorPage'
import { BibliotecarioReservasPage }    from '@/pages/BibliotecarioReservasPage'
import { BibliotecarioEmprestimosPage } from '@/pages/BibliotecarioEmprestimosPage'

export default function App() {
  // A rota de entrada não tem trilho: o rail é mobiliário de sessão, e exibi-lo
  // ao lado do formulário mostrava o nome de outra pessoa e um botão "Sair"
  // para quem ainda não entrou.
  const naEntrada = useLocation().pathname === '/login'

  return (
    <>
      {/* Sem isto quem navega por teclado atravessava o trilho inteiro em toda
          troca de tela (WCAG 2.4.1). O foco vai por script, não pelo `#conteudo`
          da URL: a âncora deixaria um hash que o roteador carregaria adiante. */}
      {!naEntrada && (
        <a
          href="#conteudo"
          className="link-pular"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('conteudo')?.focus()
          }}
        >
          Pular para o conteúdo
        </a>
      )}
      {!naEntrada && <Navbar />}
      {/* O trilho de zona vira coluna fixa a partir de xl — o conteúdo abre espaço para ele */}
      {/* tabIndex -1: alvo de foco programático do link "Pular para o conteúdo" e
          de quando o Modal fecha sem ter para onde devolver. Não entra no Tab. */}
      <main id="conteudo" tabIndex={-1} className={naEntrada ? undefined : 'xl:pl-60 focus:outline-none'}>
        <Routes>
          {/* Público */}
          <Route path="/login"             element={<LoginPage />} />
          <Route path="/"                  element={<CatalogoPage />} />
          <Route path="/livros/:id"        element={<DetalhesLivroPage />} />
          <Route path="/autores/:slug"     element={<DetalhesAutorPage />} />

          {/* Leitor autenticado */}
          <Route element={<ProtectedRoute requiredRole="leitor" />}>
            <Route path="/minhas-reservas"    element={<MinhasReservasPage />} />
            <Route path="/meus-emprestimos"   element={<MeusEmprestimosPage />} />
          </Route>

          {/* Bibliotecário */}
          <Route element={<ProtectedRoute requiredRole="bibliotecario" />}>
            <Route path="/bibliotecario/reservas"    element={<BibliotecarioReservasPage />} />
            <Route path="/bibliotecario/emprestimos" element={<BibliotecarioEmprestimosPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}
