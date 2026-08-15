import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthHook'
import { Button, Input, Form, Alert } from '@/components'
import { getErrorMessage } from '@/utils/format'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [emailError, setEmailError] = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEmailError('')

    if (!email.includes('@')) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    if (!password) return

    setLoading(true)
    try {
      await login({ email, password })
      navigate('/')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

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
            <p className="text-sm text-surface-700 mt-1">Acesse sua conta para reservar Livros</p>
          </div>

          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit}>
            <Form.Field>
              <Input
                label="E-mail"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={emailError}
                autoComplete="email"
                required
              />
            </Form.Field>
            <Form.Field>
              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Form.Field>
            <Form.Actions>
              <Button
                variant="primary"
                type="submit"
                loading={loading}
                className="w-full"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>
            </Form.Actions>
          </Form>
        </div>
      </div>
    </div>
  )
}
