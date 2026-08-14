import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthHook'
import { Button, Input, Form, Alert } from '@/components'
import { getErrorMessage } from '@/utils/format'

export function LoginPage() {
  const { login } = useAuth()
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

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="card-body">
          <div className="mb-6 text-center">
            <div className="text-4xl mb-2">📚</div>
            <h1 className="text-2xl font-semibold text-surface-900">Biblioteca</h1>
            <p className="text-sm text-surface-700 mt-1">Entre para acessar sua conta</p>
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
