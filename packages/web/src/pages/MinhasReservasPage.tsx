import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getMyReservations } from '@/api/reservations'
import { Table, Alert, LoadingPage, ReservationStatusBadge } from '@/components'
import { useNow } from '@/hooks/useNow'
import {
  formatDateTime,
  formatDuration,
  isExpiringSoon,
  reservationState,
  getErrorMessage,
} from '@/utils/format'
import type { ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

function reservationColumns(now: Date): Column<ReservationDetail>[] {
  return [
    {
      key: 'book',
      header: 'Livro',
      render: (r) => (
        <Link
          to={`/livros/${r.copy.book.id}`}
          className="text-primary-600 hover:underline font-medium text-sm"
        >
          {r.copy.book.title}
        </Link>
      ),
    },
    {
      key: 'author',
      header: 'Autor',
      render: (r) => <span className="text-sm">{r.copy.book.author.name}</span>,
    },
    {
      key: 'expiresAt',
      header: 'Retire em até',
      // O prazo é a promessa do produto: o tempo que resta vem primeiro, a data
      // absoluta fica como referência para quem quer se programar. Uma Reserva
      // encerrada não tem prazo nenhum a mostrar.
      render: (r) =>
        reservationState(r, now) === 'ativa' ? (
          <span className="text-sm whitespace-nowrap">
            <strong className={isExpiringSoon(r, now) ? 'text-warning-700' : 'text-surface-900'}>
              {formatDuration(r.expiresAt, now)}
            </strong>
            <br />
            <span className="text-xs text-surface-700">{formatDateTime(r.expiresAt)}</span>
          </span>
        ) : (
          <span className="text-sm text-surface-700">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ReservationStatusBadge state={reservationState(r, now)} expiringSoon={isExpiringSoon(r, now)} />
      ),
    },
  ]
}

export function MinhasReservasPage() {
  const now = useNow()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'reservations'],
    queryFn: getMyReservations,
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="error">{getErrorMessage(error)}</Alert>
      </div>
    )
  }

  const reservations = data ?? []
  const expiring = reservations.filter((r) => isExpiringSoon(r, now))

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Minhas Reservas</h1>

      {expiring.length > 0 && (
        <Alert variant="warning" title="Retirada urgente" className="mb-4">
          {expiring.length === 1
            ? `A reserva de "${expiring[0].copy.book.title}" expira em ${formatDuration(expiring[0].expiresAt, now)}.`
            : `${expiring.length} das suas reservas expiram em menos de 1 hora.`}{' '}
          Depois disso a cópia volta ao acervo e fica livre para outro leitor.
        </Alert>
      )}

      <Table
        columns={reservationColumns(now)}
        data={reservations}
        keyField="id"
        caption="Suas reservas de livros"
        emptyMessage="Você não tem reservas ativas."
      />
    </div>
  )
}
