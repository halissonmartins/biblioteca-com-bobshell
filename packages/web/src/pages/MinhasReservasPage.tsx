import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getMyReservations } from '@/api/reservations'
import { Table, Alert, LoadingPage, ReservationStatusBadge } from '@/components'
import { formatDateTime, isReservationActive, getErrorMessage } from '@/utils/format'
import type { ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

const columns: Column<ReservationDetail>[] = [
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
    header: 'Expira em',
    render: (r) => <span className="text-sm">{formatDateTime(r.expiresAt)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <ReservationStatusBadge
        active={isReservationActive(r.expiresAt, r.convertedAt, r.cancelledAt)}
      />
    ),
  },
]

export function MinhasReservasPage() {
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Minhas Reservas</h1>
      <Table
        columns={columns}
        data={data ?? []}
        keyField="id"
        caption="Suas reservas de livros"
        emptyMessage="Você não tem reservas ativas."
      />
    </div>
  )
}
