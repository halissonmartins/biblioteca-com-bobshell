/**
 * Regressão da issue #27 — Keycloak fora do ar deixava a tela de acesso muda.
 *
 * Por que aqui e não em `e2e/`: reproduzir a falha exige derrubar o discovery
 * do Keycloak, e a `e2e/AGENTS.md` proíbe mock, stub e interceptação de rede
 * naquela suíte ("os testes preenchem a tela do Keycloak de verdade"). O
 * recorte honesto é este: só o `react-oidc-context` é dublê — o `AuthProvider`,
 * a `LoginPage` e o contrato entre os dois são os de produção.
 *
 * O defeito era de fiação, não de mensagem: o `react-oidc-context` resolve
 * `signinRedirect()` com `null` no erro em vez de rejeitar, então o `.catch()`
 * da página nunca rodava, o `<Alert>` nunca aparecia e `loading={!error}`
 * mantinha o botão desabilitado para sempre. Um teste só do mapeador de
 * mensagem não teria pego isso.
 *
 * Render sem `@testing-library`: `react-dom/client` + `act` bastam para o que
 * se afirma aqui, e o pacote web não ganha dependência nova por causa de um
 * teste.
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/hooks/useAuth'
import { LoginPage } from './LoginPage'

/** Estado que o `react-oidc-context` devolveria — trocado a cada cenário. */
let oidc: Record<string, unknown>

vi.mock('react-oidc-context', () => ({
  useAuth: () => oidc,
}))

// Só dispara com token; nos cenários daqui nunca há um. Dublado mesmo assim
// para que uma regressão no provider não vire requisição de verdade.
vi.mock('@/api/me', () => ({
  getMe: vi.fn(() => Promise.resolve(null)),
}))

/** `ErrorContext` como a v3.3.1 monta: objeto normalizado, com `source`. */
function erroDeDiscovery() {
  return {
    name: 'TypeError',
    message: 'Failed to fetch',
    source: 'signinRedirect',
    innerError: new TypeError('Failed to fetch'),
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // React 19 exige a marca para o `act` fora do ambiente de teste dele.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

function montarTelaDeAcesso() {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )
  })
}

function botaoEntrar(): HTMLButtonElement {
  const botao = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Entrar'),
  )
  if (!botao) throw new Error('botão Entrar não encontrado')
  return botao
}

describe('LoginPage quando o Keycloak não responde', () => {
  beforeEach(() => {
    oidc = {
      user: undefined,
      isLoading: false,
      isAuthenticated: false,
      error: erroDeDiscovery(),
      // Resolve com `null` em vez de rejeitar — é exatamente o que a
      // v3.3.1 faz, e é o que matava o tratamento de erro da tela.
      signinRedirect: vi.fn(() => Promise.resolve(null)),
      signoutRedirect: vi.fn(() => Promise.resolve()),
    }
  })

  it('mostra o motivo em vez de "Encaminhando para o acesso seguro…"', () => {
    montarTelaDeAcesso()

    const texto = container.textContent ?? ''
    expect(texto).toContain('Não foi possível falar com o serviço de acesso')
    expect(texto).not.toContain('Encaminhando para o acesso seguro')
  })

  it('renderiza o alerta de erro', () => {
    montarTelaDeAcesso()

    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível falar com o serviço de acesso')
  })

  it('deixa o detalhe técnico à vista, para quem for reportar', () => {
    montarTelaDeAcesso()

    expect(container.textContent).toContain('Failed to fetch')
  })

  it('libera o botão Entrar — o fallback volta a existir', () => {
    montarTelaDeAcesso()

    const botao = botaoEntrar()
    expect(botao.disabled).toBe(false)
    expect(botao.getAttribute('aria-busy')).toBe('false')
  })

  it('tenta de novo ao clicar no botão liberado', () => {
    montarTelaDeAcesso()
    const chamadasDoRedirectAutomatico = (oidc['signinRedirect'] as ReturnType<typeof vi.fn>).mock
      .calls.length

    act(() => {
      botaoEntrar().click()
    })

    expect((oidc['signinRedirect'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      chamadasDoRedirectAutomatico + 1,
    )
  })
})

describe('LoginPage no caminho normal', () => {
  beforeEach(() => {
    oidc = {
      user: undefined,
      isLoading: false,
      isAuthenticated: false,
      error: undefined,
      signinRedirect: vi.fn(() => Promise.resolve(null)),
      signoutRedirect: vi.fn(() => Promise.resolve()),
    }
  })

  it('encaminha ao Keycloak e mantém o botão em carregamento', () => {
    montarTelaDeAcesso()

    expect(oidc['signinRedirect']).toHaveBeenCalled()
    expect(container.textContent).toContain('Encaminhando para o acesso seguro')
    expect(container.querySelector('[role="alert"]')).toBeNull()

    const botao = botaoEntrar()
    expect(botao.disabled).toBe(true)
    expect(botao.getAttribute('aria-busy')).toBe('true')
  })
})
