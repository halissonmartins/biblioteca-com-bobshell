import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string          // obrigatório — acessibilidade AA
  error?: string
  hint?: string
}

/**
 * Componente canônico de input.
 * Todo <input> do projeto usa este componente — label é obrigatório.
 *
 * @example
 * <Input label="Buscar livro" placeholder="Título ou autor..." value={q} onChange={...} />
 * <Input label="E-mail" type="email" error={errors.email} />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id: externalId, className = '', ...props }, ref) => {
    const generatedId = useId()
    const id = externalId ?? generatedId
    const errorId = `${id}-error`
    const hintId  = `${id}-hint`

    const describedBy = [
      error ? errorId : null,
      hint  ? hintId  : null,
    ].filter(Boolean).join(' ') || undefined

    return (
      <div className="w-full">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={['input', error ? 'input-error' : '', className].filter(Boolean).join(' ')}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="field-error">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
