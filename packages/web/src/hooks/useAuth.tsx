/**
 * AuthProvider — adapta o OIDC do Keycloak ao contexto que o app já usa.
 *
 * Quem guarda credencial e sessão é o Keycloak (ADR-0009): aqui não há senha,
 * não há formulário e não há token nosso. O `react-oidc-context` cuida do
 * Authorization Code + PKCE; este provider traduz o resultado para o formato
 * que Navbar, ProtectedRoute e as páginas já esperavam.
 *
 * O papel NÃO é lido do token: vem do `GET /me`, o mesmo lugar de onde vem o id
 * local. Ter uma única fonte de verdade evita a tela e a API discordarem sobre
 * quem é Bibliotecário.
 */
import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth as useOidc } from 'react-oidc-context'
import { setToken, clearToken } from '@/api/client'
import { getMe } from '@/api/me'
import type { User } from '../../../shared/src/types/domain'
import { AuthContext } from './authContext'

/**
 * Onde retomar depois do Keycloak.
 *
 * Vai para o sessionStorage porque o caminho passa por uma navegação de página
 * inteira para outra origem: estado de React não sobrevive a isso.
 */
const RETURN_TO_KEY = 'auth_return_to'

export function AuthProvider({ children }: { children: ReactNode }) {
  const oidc = useOidc()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [perfilRecusado, setPerfilRecusado] = useState(false)

  const accessToken = oidc.user?.access_token ?? null

  /**
   * Há token, mas o perfil ainda não chegou.
   *
   * **Derivado, não estado.** Um `useState` ligado dentro do efeito abriria uma
   * janela de um render — depois de o OIDC terminar, antes de o efeito rodar —
   * em que `isLoading` seria `false` e `user` seria `null`. O guard leria isso
   * como visitante e devolveria ao Keycloak, que tem sessão de SSO e traz de
   * volta ao Catálogo: quem recarregasse `/minhas-reservas` autenticado cairia
   * no Catálogo sem entender por quê.
   */
  const perfilPendente = accessToken !== null && user === null && !perfilRecusado

  // O token entra no cliente HTTP a cada renovação silenciosa, não só no login.
  useEffect(() => {
    if (accessToken) setToken(accessToken)
    else clearToken()
  }, [accessToken])

  // Busca o perfil local assim que há token. É também o que dispara a criação
  // do espelho local no primeiro acesso de uma conta recém-cadastrada.
  useEffect(() => {
    if (!accessToken) {
      setUser(null)
      setPerfilRecusado(false)
      return
    }

    let cancelado = false
    setPerfilRecusado(false)

    getMe()
      .then((perfil) => {
        if (!cancelado) setUser(perfil)
      })
      .catch(() => {
        // Token válido para o Keycloak mas recusado por nós — conta sem papel
        // desta biblioteca (403). Marcar encerra o carregamento: sem isto a
        // aplicação ficaria em branco para sempre, esperando um perfil que
        // nunca vem.
        if (cancelado) return
        setUser(null)
        setPerfilRecusado(true)
      })

    return () => {
      cancelado = true
    }
  }, [accessToken])

  // Autenticou: retoma a rota que a pessoa tentou abrir antes de ser mandada
  // ao Keycloak. O `onSigninCallback` já devolveu a URL para "/".
  useEffect(() => {
    if (!user) return
    const returnTo = sessionStorage.getItem(RETURN_TO_KEY)
    if (!returnTo) return
    sessionStorage.removeItem(RETURN_TO_KEY)
    if (returnTo !== '/') navigate(returnTo, { replace: true })
  }, [user, navigate])

  const login = useCallback(
    async (returnTo?: string) => {
      if (returnTo && returnTo !== '/login') {
        sessionStorage.setItem(RETURN_TO_KEY, returnTo)
      }
      await oidc.signinRedirect()
    },
    [oidc],
  )

  const logout = useCallback(async () => {
    clearToken()
    setUser(null)
    sessionStorage.removeItem(RETURN_TO_KEY)
    // Encerra a sessão no Keycloak também — sem isto o próximo login entra
    // sozinho pelo SSO e o botão "Sair" vira decoração.
    await oidc.signoutRedirect()
  }, [oidc])

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: user !== null,
        isLoading: oidc.isLoading || perfilPendente,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
