/**
 * AuthContext — definição do contexto de autenticação.
 * Separado para garantir fast-refresh do Vite (apenas exports não-componentes).
 */
import { createContext } from 'react'
import type { User } from '../../../shared/src/types/domain'
import type { ErroDeAcesso } from '@/utils/authError'

export interface AuthContextValue {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  /**
   * True enquanto a sessão do Keycloak é restaurada ou o perfil é buscado.
   * Sem isto o guard de rota vê "não autenticado" no primeiro render e manda
   * quem já entrou de volta para o Keycloak — um laço de redirect.
   */
  isLoading: boolean
  /**
   * Falha do fluxo de acesso, já traduzida — `null` quando está tudo bem.
   *
   * Existe porque o `react-oidc-context` **não rejeita** `signinRedirect()`:
   * no erro ele guarda a falha no estado interno e resolve com `null`. Quem
   * chamasse `login()` esperando uma rejeição nunca saberia que o Keycloak
   * está fora do ar — foi assim que a tela de acesso ficou muda (issue #27).
   */
  error: ErroDeAcesso | null
  /**
   * Manda para a tela do Keycloak (Authorization Code + PKCE).
   * `returnTo` é a rota para onde voltar depois de autenticar — o Leitor que
   * tentou reservar retoma de onde parou (docs/design/fluxos.md).
   */
  login: (returnTo?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
