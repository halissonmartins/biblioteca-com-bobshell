import { type FormHTMLAttributes, type ReactNode } from 'react'

interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  children: ReactNode
}

interface FormFieldProps {
  children: ReactNode
}

interface FormActionsProps {
  children: ReactNode
}

/**
 * Componente canônico de formulário.
 * Fornece espaçamento e estrutura consistentes.
 * Sempre usar Form + Form.Field + Form.Actions — nunca <form> ad-hoc.
 *
 * @example
 * <Form onSubmit={handleSubmit}>
 *   <Form.Field>
 *     <Input label="E-mail" type="email" {...register('email')} />
 *   </Form.Field>
 *   <Form.Actions>
 *     <Button type="submit">Entrar</Button>
 *   </Form.Actions>
 * </Form>
 */
export function Form({ children, className = '', ...props }: FormProps) {
  return (
    <form noValidate className={['flex flex-col gap-4', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </form>
  )
}

Form.Field = function FormField({ children }: FormFieldProps) {
  return <div className="flex flex-col gap-1">{children}</div>
}

Form.Actions = function FormActions({ children }: FormActionsProps) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {children}
    </div>
  )
}
