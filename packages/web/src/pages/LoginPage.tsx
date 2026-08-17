import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthHook'
import { Button, Alert } from '@/components'
import { getErrorMessage } from '@/utils/format'

/**
 * Porta de entrada.
 *
 * O formulário de e-mail e senha saiu daqui: quem pede credencial é o Keycloak
 * (ADR-0009), que também hospeda o auto-cadastro. Esta tela só encaminha — e
 * mantém a chapa de esmalte para que a passagem não pareça um erro.
 */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const jaRedirecionou = useRef(false)

  // Rota que o guard tentou abrir antes de mandar para cá.
  const from = (location.state as { from?: string } | null)?.from

  const encaminhar = useCallback(() => {
    setError('')
    jaRedirecionou.current = true
    login(from).catch((err: unknown) => {
      jaRedirecionou.current = false
      setError(getErrorMessage(err))
    })
  }, [login, from])

  useEffect(() => {
    // StrictMode monta duas vezes em desenvolvimento; sem a trava sairiam dois
    // redirects e o segundo invalidaria o state do primeiro.
    if (jaRedirecionou.current || isLoading || isAuthenticated) return
    encaminhar()
  }, [encaminhar, isLoading, isAuthenticated])

  // Quem já entrou não tem o que fazer na porta
  if (isAuthenticated) return <Navigate to="/" replace />

  return (
    // A entrada é o campo de esmalte com a chapa branca aparafusada nele — sem
    // o trilho de sessão, era a única tela do build que não tinha mundo nenhum.
    <div className="min-h-screen bg-primary-500 flex flex-col items-center justify-center gap-6 p-4">
      <p className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-placa text-surface-0">
        Biblioteca
      </p>

      <div className="card w-full max-w-sm">
        <div className="card-body">
          <div className="mb-6 pb-4 border-b border-surface-200">
            <h1 className="text-2xl">Acesso</h1>
            <p className="text-sm text-surface-700 mt-1">
              {error
                ? 'Não foi possível abrir a tela de acesso.'
                : 'Encaminhando para o acesso seguro…'}
            </p>
          </div>

          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          {/* Fallback: se o redirect automático não sair (bloqueio de pop-up,
              rede lenta), a pessoa não fica olhando uma tela parada. */}
          <Button variant="primary" className="w-full" loading={!error} onClick={encaminhar}>
            Entrar
          </Button>
        </div>
      </div>
    </div>
  )
}
