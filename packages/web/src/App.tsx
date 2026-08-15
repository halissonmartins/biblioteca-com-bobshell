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
      {!naEntrada && <Navbar />}
      {/* O trilho de zona vira coluna fixa a partir de lg — o conteúdo abre espaço para ele */}
      <main className={naEntrada ? undefined : 'lg:pl-60'}>
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
