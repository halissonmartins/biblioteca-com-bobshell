import { type ReactNode } from 'react'
import type { ReservationState } from '@/utils/format'
import type { CopyStatus } from '../../../shared/src/types/domain'

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
 * - Cópia disponível     → variant="success"   "Disponível"
 * - Cópia reservada      → variant="warning"   "Reservado"
 * - Cópia emprestada     → variant="danger"    "Emprestado"
 * - Reserva ativa        → variant="success"   "Ativa"
 * - Reserva expirando    → variant="warning"   "Expira em breve"
 * - Reserva convertida   → variant="success"   "Convertida"
 * - Reserva cancelada    → variant="neutral"   "Cancelada"
 * - Reserva expirada     → variant="neutral"   "Expirada"
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

export function CopyStatusBadge({ status }: { status: CopyStatus }) {
  const map = {
    available: { variant: 'success' as const, label: 'Disponível' },
    reserved:  { variant: 'warning' as const, label: 'Reservado' },
    loaned:    { variant: 'danger'  as const, label: 'Emprestado' },
  }
  const entry = map[status]
  // Um status ausente ou desconhecido não derruba a linha inteira: o código da
  // Cópia continua legível e o Bibliotecário segue atendendo.
  if (!entry) return null
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

/**
 * Estado da Reserva. Os quatro estados de domínio têm rótulo próprio: colapsar
 * "convertida" em "Expirada" diz ao Bibliotecário que a operação que ele
 * acabou de concluir falhou.
 *
 * `expiringSoon` é um refinamento visual de "ativa", não um quinto estado —
 * é a Reserva que ainda vale mas exige ação hoje (warning-500, design-system).
 */
export function ReservationStatusBadge({
  state,
  expiringSoon = false,
}: {
  state: ReservationState
  expiringSoon?: boolean
}) {
  if (state === 'ativa' && expiringSoon) {
    return <Badge variant="warning">Expira em breve</Badge>
  }

  const map = {
    ativa:      { variant: 'success' as const, label: 'Ativa' },
    convertida: { variant: 'success' as const, label: 'Convertida' },
    expirada:   { variant: 'neutral' as const, label: 'Expirada' },
  }
  const entry = map[state]
  if (!entry) return null
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

/**
 * Disponibilidade de um Livro — não de uma Cópia.
 *
 * A API entrega apenas a contagem (`BookDetail.availableCopies`), sem os
 * estados individuais. Usar CopyStatusBadge aqui obrigava a inventar um: um
 * Livro cujas Cópias estão todas *reservadas* aparecia como "Emprestado".
 */
export function BookAvailabilityBadge({ availableCopies }: { availableCopies: number }) {
  return availableCopies > 0
    ? <Badge variant="success">Disponível</Badge>
    : <Badge variant="neutral">Indisponível</Badge>
}
