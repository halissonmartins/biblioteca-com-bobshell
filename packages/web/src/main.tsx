import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider as OidcProvider, type AuthProviderProps } from 'react-oidc-context'
import { AuthProvider } from '@/hooks/useAuth'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // 30 s
    },
  },
})

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8081'
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'biblioteca'
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'biblioteca-web'

/** Authorization Code + PKCE — o padrão para SPA (ADR-0009). */
const oidcConfig: AuthProviderProps = {
  authority: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  client_id: KEYCLOAK_CLIENT_ID,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  // O Keycloak honra o Accept-Language do browser antes do defaultLocale do
  // realm: sem isto, quem tem o navegador em inglês vê "Sign in to your
  // account" no meio de um produto inteiramente em português.
  extraQueryParams: { ui_locales: 'pt-BR' },
  // A volta do Keycloak carrega ?code=&state= na URL. Limpar evita que um
  // reload tente trocar um código já usado — e que a barra de endereço exiba
  // o código da sessão.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, '/')
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <OidcProvider {...oidcConfig}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </OidcProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
