import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAllReservations } from '@/api/reservations'
import { Table, Input, Alert, LoadingPage, ReservationStatusBadge } from '@/components'
import { formatDateTime, isReservationActive, getErrorMessage } from '@/utils/format'
import type { ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

const columns: Column<ReservationDetail>[] = [
  {
    key: 'book',
    header: 'Livro',
    render: (r) => (
      <Link to={`/livros/${r.copy.book.id}`} className="text-primary-600 hover:underline font-medium text-sm">
        {r.copy.book.title}
      </Link>
    ),
  },
  {
    key: 'leitor',
    header: 'Leitor',
    render: (r) => (
      <span className="text-sm">
        {r.user.name}
        <br />
        <span className="text-xs text-surface-700">{r.user.email}</span>
      </span>
    ),
  },
  {
    key: 'copy',
    header: 'Cópia',
    render: (r) => <span className="text-sm font-mono">{r.copy.code}</span>,
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

export function BibliotecarioReservasPage() {
  const [userFilter, setUserFilter] = useState('')
  const [appliedFilter, setAppliedFilter] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reservations', appliedFilter],
    queryFn: () => getAllReservations(appliedFilter || undefined),
  })

  function handleFilter() {
    setAppliedFilter(userFilter)
  }

  function handleClear() {
    setUserFilter('')
    setAppliedFilter('')
  }

  if (isLoading) return <LoadingPage />

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Reservas</h1>

      {/* Filtro por usuário (RF-B3) */}
      <div className="card card-body mb-6 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <Input
            label="Filtrar por leitor (ID ou e-mail)"
            placeholder="ID do usuário ou e-mail"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" onClick={handleFilter}>
            Filtrar
          </button>
          {appliedFilter && (
            <button className="btn-secondary btn-sm" onClick={handleClear}>
              Limpar
            </button>
          )}
        </div>
      </div>

      {isError && (
        <Alert variant="error" className="mb-4">{getErrorMessage(error)}</Alert>
      )}

      <Table
        columns={columns}
        data={data ?? []}
        keyField="id"
        caption="Reservas do sistema"
        emptyMessage="Nenhuma reserva encontrada."
        loading={isLoading}
      />
    </div>
  )
}
