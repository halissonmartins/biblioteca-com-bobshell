import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAllLoans, returnLoan, createLoan } from '@/api/loans'
import { getAllReservations } from '@/api/reservations'
import { Table, Input, Alert, Button, Modal, LoadingPage, Badge } from '@/components'
import { formatDate, formatDateTime, getErrorMessage, isReservationActive } from '@/utils/format'
import { isApiRequestError } from '@/api/client'
import type { LoanDetail, ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

function LoanColumns(
  onReturn: (loan: LoanDetail) => void,
): Column<LoanDetail>[] {
  return [
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
      key: 'dueAt',
      header: 'Vencimento',
      render: (r) => {
        const overdue = !r.returnedAt && new Date(r.dueAt) < new Date()
        return (
          <span className={`text-sm ${overdue ? 'text-danger-500 font-medium' : ''}`}>
            {formatDate(r.dueAt)}
            {overdue && ' ⚠️'}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.returnedAt ? (
          <Badge variant="neutral">Devolvido</Badge>
        ) : (
          <Badge variant="success">Em curso</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        !r.returnedAt ? (
          <Button variant="secondary" size="sm" onClick={() => onReturn(r)}>
            Registrar devolução
          </Button>
        ) : null,
    },
  ]
}

export function BibliotecarioEmprestimosPage() {
  const queryClient = useQueryClient()

  const [userFilter, setUserFilter]         = useState('')
  const [appliedFilter, setAppliedFilter]   = useState('')
  const [returnTarget, setReturnTarget]     = useState<LoanDetail | null>(null)
  const [loanTarget, setLoanTarget]         = useState<ReservationDetail | null>(null)
  const [loanDueAt, setLoanDueAt]           = useState('')
  const [successMsg, setSuccessMsg]         = useState('')
  const [opError, setOpError]               = useState('')
  const [showNewLoan, setShowNewLoan]       = useState(false)

  // Empréstimos
  const loansQuery = useQuery({
    queryKey: ['loans', appliedFilter],
    queryFn: () => getAllLoans(appliedFilter || undefined),
  })

  // Reservas ativas — para criar novo empréstimo (RF-B4)
  const reservationsQuery = useQuery({
    queryKey: ['reservations-active'],
    queryFn: () => getAllReservations(),
    enabled: showNewLoan,
  })

  const activeReservations = (reservationsQuery.data ?? []).filter((r) =>
    isReservationActive(r.expiresAt, r.convertedAt, r.cancelledAt),
  )

  // Mutation: devolução
  const returnMutation = useMutation({
    mutationFn: () => returnLoan(returnTarget!.id),
    onSuccess: () => {
      setReturnTarget(null)
      setSuccessMsg('Devolução registrada com sucesso.')
      setOpError('')
      void queryClient.invalidateQueries({ queryKey: ['loans'] })
    },
    onError: (err) => {
      setReturnTarget(null)
      setOpError(isApiRequestError(err) ? err.message : getErrorMessage(err))
    },
  })

  // Mutation: novo empréstimo
  const loanMutation = useMutation({
    mutationFn: () =>
      createLoan({
        reservationId: loanTarget!.id,
        dueAt: new Date(loanDueAt).toISOString(),
      }),
    onSuccess: () => {
      setLoanTarget(null)
      setLoanDueAt('')
      setShowNewLoan(false)
      setSuccessMsg('Empréstimo registrado com sucesso.')
      setOpError('')
      void queryClient.invalidateQueries({ queryKey: ['loans'] })
      void queryClient.invalidateQueries({ queryKey: ['reservations-active'] })
    },
    onError: (err) => {
      setLoanTarget(null)
      setOpError(isApiRequestError(err) ? err.message : getErrorMessage(err))
    },
  })

  function handleFilter() {
    setAppliedFilter(userFilter)
  }

  function handleClear() {
    setUserFilter('')
    setAppliedFilter('')
  }

  const columns = LoanColumns((loan) => {
    setSuccessMsg('')
    setOpError('')
    setReturnTarget(loan)
  })

  if (loansQuery.isLoading) return <LoadingPage />

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold">Empréstimos</h1>
        <Button
          variant="primary"
          onClick={() => {
            setSuccessMsg('')
            setOpError('')
            setShowNewLoan(true)
          }}
        >
          + Novo empréstimo
        </Button>
      </div>

      {/* Mensagens de feedback */}
      {successMsg && (
        <Alert variant="success" className="mb-4">{successMsg}</Alert>
      )}
      {opError && (
        <Alert variant="error" className="mb-4">{opError}</Alert>
      )}

      {/* Filtro por leitor (RF-B3) */}
      <div className="card card-body mb-6 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <Input
            label="Filtrar por leitor (ID)"
            placeholder="ID do usuário"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" onClick={handleFilter}>Filtrar</button>
          {appliedFilter && (
            <button className="btn-secondary btn-sm" onClick={handleClear}>Limpar</button>
          )}
        </div>
      </div>

      {loansQuery.isError && (
        <Alert variant="error" className="mb-4">{getErrorMessage(loansQuery.error)}</Alert>
      )}

      <Table
        columns={columns}
        data={loansQuery.data ?? []}
        keyField="id"
        caption="Empréstimos do sistema"
        emptyMessage="Nenhum empréstimo encontrado."
        loading={loansQuery.isLoading}
      />

      {/* Modal: confirmar devolução (RF-B5) */}
      <Modal
        open={returnTarget !== null}
        onClose={() => setReturnTarget(null)}
        title="Confirmar devolução"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={returnMutation.isPending}
              onClick={() => returnMutation.mutate()}
            >
              {returnMutation.isPending ? 'Registrando…' : 'Confirmar devolução'}
            </Button>
          </>
        }
      >
        {returnTarget && (
          <p className="text-sm text-surface-700">
            Confirmar a devolução de{' '}
            <strong className="text-surface-900">{returnTarget.copy.book.title}</strong> pelo
            leitor <strong className="text-surface-900">{returnTarget.user.name}</strong>?
          </p>
        )}
      </Modal>

      {/* Modal: novo empréstimo (RF-B4) */}
      <Modal
        open={showNewLoan}
        onClose={() => { setShowNewLoan(false); setLoanTarget(null); setLoanDueAt('') }}
        title="Novo empréstimo"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setShowNewLoan(false); setLoanTarget(null); setLoanDueAt('') }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={loanMutation.isPending}
              disabled={!loanTarget || !loanDueAt}
              onClick={() => loanMutation.mutate()}
            >
              {loanMutation.isPending ? 'Registrando…' : 'Confirmar empréstimo'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-surface-700">
            Selecione uma reserva ativa e defina a data de vencimento do empréstimo.
          </p>

          {reservationsQuery.isLoading && (
            <p className="text-sm text-surface-700">Carregando reservas…</p>
          )}

          {activeReservations.length === 0 && !reservationsQuery.isLoading && (
            <Alert variant="warning">Nenhuma reserva ativa no momento.</Alert>
          )}

          {activeReservations.length > 0 && (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto border border-surface-200 rounded-md p-2">
              {activeReservations.map((res) => (
                <label
                  key={res.id}
                  className={`flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-surface-50 ${loanTarget?.id === res.id ? 'bg-primary-50 border border-primary-200' : 'border border-transparent'}`}
                >
                  <input
                    type="radio"
                    name="reservation"
                    className="mt-0.5 accent-primary-500"
                    checked={loanTarget?.id === res.id}
                    onChange={() => setLoanTarget(res)}
                  />
                  <div>
                    <p className="text-sm font-medium text-surface-900">{res.copy.book.title}</p>
                    <p className="text-xs text-surface-700">{res.user.name} — expira {formatDateTime(res.expiresAt)}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <Input
            label="Data de vencimento"
            type="date"
            value={loanDueAt}
            onChange={(e) => setLoanDueAt(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </Modal>
    </div>
  )
}
