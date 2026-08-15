import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAllReservations } from '@/api/reservations'
import { createLoan } from '@/api/loans'
import { isApiRequestError } from '@/api/client'
import { Table, Input, Alert, Button, Modal, LoadingPage, ReservationStatusBadge } from '@/components'
import { formatDate, formatDateTime, isReservationActive, getErrorMessage } from '@/utils/format'
import { LOAN_PERIOD_DAYS, defaultDueDate, dueDateToISO, todayInputValue } from '@/utils/loan'
import type { ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

type StatusFilter = 'ativas' | 'todas'

function isActive(r: ReservationDetail): boolean {
  return isReservationActive(r.expiresAt, r.convertedAt, r.cancelledAt)
}

/**
 * Traduz o erro da API para linguagem de balcão.
 * O Leitor está do outro lado ouvindo — a mensagem precisa dizer o que houve
 * com a Cópia física e qual é o próximo passo, não repetir o vocabulário da API.
 */
function counterErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) {
    if (err.code === 'RESERVATION_EXPIRED') {
      return 'A Reserva expirou e a Cópia voltou ao acervo. Peça ao Leitor para reservar novamente.'
    }
    if (err.code === 'NOT_FOUND') {
      return 'Reserva não encontrada. Atualize a lista e tente de novo.'
    }
    return err.message
  }
  return getErrorMessage(err)
}

function reservationColumns(
  onEfetivar: (reservation: ReservationDetail) => void,
): Column<ReservationDetail>[] {
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
      render: (r) => <ReservationStatusBadge active={isActive(r)} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) =>
        isActive(r) ? (
          <Button size="sm" onClick={() => onEfetivar(r)}>
            Efetivar empréstimo
          </Button>
        ) : null,
    },
  ]
}

export function BibliotecarioReservasPage() {
  const queryClient = useQueryClient()

  const [userFilter, setUserFilter]       = useState('')
  const [appliedFilter, setAppliedFilter] = useState('')
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('ativas')
  const [loanTarget, setLoanTarget]       = useState<ReservationDetail | null>(null)
  const [loanDueAt, setLoanDueAt]         = useState('')
  const [loanError, setLoanError]         = useState('')
  const [successMsg, setSuccessMsg]       = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reservations', appliedFilter],
    queryFn: () => getAllReservations(appliedFilter || undefined),
  })

  const reservations = useMemo(() => data ?? [], [data])
  const active       = useMemo(() => reservations.filter(isActive), [reservations])
  const visible      = statusFilter === 'ativas' ? active : reservations

  // Efetivação do Empréstimo a partir da Reserva já escolhida na linha (RF-B4, RN-6)
  const loanMutation = useMutation({
    mutationFn: () =>
      createLoan({
        reservationId: loanTarget!.id,
        dueAt: dueDateToISO(loanDueAt),
      }),
    onSuccess: (loan) => {
      setSuccessMsg(`Empréstimo registrado. Devolução até ${formatDate(loan.dueAt)}.`)
      setLoanTarget(null)
      setLoanDueAt('')
      setLoanError('')
      void queryClient.invalidateQueries({ queryKey: ['reservations'] })
      void queryClient.invalidateQueries({ queryKey: ['loans'] })
    },
    // A seleção é preservada de propósito: o erro é resolvido dentro do modal,
    // sem obrigar o Bibliotecário a reencontrar a linha com o Leitor esperando.
    onError: (err) => setLoanError(counterErrorMessage(err)),
  })

  function handleEfetivar(reservation: ReservationDetail) {
    setSuccessMsg('')
    setLoanError('')
    setLoanTarget(reservation)
    setLoanDueAt(defaultDueDate())
  }

  function handleCloseLoan() {
    setLoanTarget(null)
    setLoanDueAt('')
    setLoanError('')
  }

  function handleFilter() {
    setAppliedFilter(userFilter)
  }

  function handleClear() {
    setUserFilter('')
    setAppliedFilter('')
  }

  const columns = reservationColumns(handleEfetivar)

  if (isLoading) return <LoadingPage />

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold">Reservas</h1>
        <div className="flex gap-2" role="group" aria-label="Filtrar reservas por status">
          <Button
            variant={statusFilter === 'ativas' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={statusFilter === 'ativas'}
            onClick={() => setStatusFilter('ativas')}
          >
            Ativas ({active.length})
          </Button>
          <Button
            variant={statusFilter === 'todas' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={statusFilter === 'todas'}
            onClick={() => setStatusFilter('todas')}
          >
            Todas ({reservations.length})
          </Button>
        </div>
      </div>

      {successMsg && (
        <Alert variant="success" className="mb-4">{successMsg}</Alert>
      )}

      {/* Filtro por usuário (RF-B3) — a API compara o id exato (findAllReservations) */}
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
          <Button variant="primary" size="sm" onClick={handleFilter}>
            Filtrar
          </Button>
          {appliedFilter && (
            <Button variant="secondary" size="sm" onClick={handleClear}>
              Limpar
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <Alert variant="error" className="mb-4">{getErrorMessage(error)}</Alert>
      )}

      <Table
        columns={columns}
        data={visible}
        keyField="id"
        caption="Reservas do sistema"
        emptyMessage={
          statusFilter === 'ativas'
            ? 'Nenhuma Reserva ativa — não há livro separado para retirar agora.'
            : 'Nenhuma reserva encontrada.'
        }
        loading={isLoading}
      />

      {/* Modal: efetivar Empréstimo (RF-B4, RN-2, RN-6) */}
      <Modal
        open={loanTarget !== null}
        onClose={handleCloseLoan}
        title="Efetivar empréstimo"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseLoan}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={loanMutation.isPending}
              disabled={!loanDueAt}
              onClick={() => loanMutation.mutate()}
            >
              {loanMutation.isPending ? 'Registrando…' : 'Confirmar empréstimo'}
            </Button>
          </>
        }
      >
        {loanTarget && (
          <div className="flex flex-col gap-4">
            {loanError && <Alert variant="error">{loanError}</Alert>}

            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-xs text-surface-700">Livro</dt>
                <dd className="text-sm font-medium text-surface-900">{loanTarget.copy.book.title}</dd>
              </div>
              <div>
                <dt className="text-xs text-surface-700">Leitor</dt>
                <dd className="text-sm text-surface-900">
                  {loanTarget.user.name}{' '}
                  <span className="text-surface-700">({loanTarget.user.email})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-surface-700">Cópia a entregar</dt>
                <dd className="text-sm font-mono text-surface-900">{loanTarget.copy.code}</dd>
              </div>
              <div>
                <dt className="text-xs text-surface-700">Reserva expira em</dt>
                <dd className="text-sm text-surface-900">{formatDateTime(loanTarget.expiresAt)}</dd>
              </div>
            </dl>

            <Input
              label="Devolução até"
              type="date"
              value={loanDueAt}
              onChange={(e) => setLoanDueAt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && loanDueAt && !loanMutation.isPending) {
                  loanMutation.mutate()
                }
              }}
              min={todayInputValue()}
              hint={`Padrão: ${LOAN_PERIOD_DAYS} dias corridos.`}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
