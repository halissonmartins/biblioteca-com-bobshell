import { type ReactNode } from 'react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral'

interface BadgeProps {
  variant: BadgeVariant
  children: ReactNode
}

/**
 * Componente canônico de badge de status.
 * Usar para exibir status de Cópia, Reserva e Empréstimo.
 *
 * Mapeamento de domínio:
 * - Cópia disponível   → variant="success"   "Disponível"
 * - Cópia reservada    → variant="warning"   "Reservado"
 * - Cópia emprestada   → variant="danger"    "Emprestado"
 * - Reserva expirada   → variant="neutral"   "Expirada"
 */
export function Badge({ variant, children }: BadgeProps) {
  const classes: Record<BadgeVariant, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger:  'badge-danger',
    neutral: 'badge-neutral',
  }
  return <span className={classes[variant]}>{children}</span>
}

// ============================================================
// Badges pré-definidos para o domínio da biblioteca
// ============================================================

export function CopyStatusBadge({ status }: { status: 'available' | 'reserved' | 'loaned' }) {
  const map = {
    available: { variant: 'success' as const, label: 'Disponível' },
    reserved:  { variant: 'warning' as const, label: 'Reservado' },
    loaned:    { variant: 'danger'  as const, label: 'Emprestado' },
  }
  const { variant, label } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function ReservationStatusBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="success">Ativa</Badge>
    : <Badge variant="neutral">Expirada</Badge>
}
