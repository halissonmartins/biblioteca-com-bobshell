import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAllLoans, returnLoan } from '@/api/loans'
import { Table, Input, Alert, Button, Modal, LoadingPage, Badge } from '@/components'
import { formatDate, getErrorMessage } from '@/utils/format'
import { isApiRequestError } from '@/api/client'
import type { LoanDetail } from '../../../shared/src/types/domain'
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
  const [successMsg, setSuccessMsg]         = useState('')
  const [opError, setOpError]               = useState('')

  // Empréstimos
  const loansQuery = useQuery({
    queryKey: ['loans', appliedFilter],
    queryFn: () => getAllLoans(appliedFilter || undefined),
  })

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
      <h1 className="text-3xl font-bold mb-6">Empréstimos</h1>

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
          <Button variant="primary" size="sm" onClick={handleFilter}>Filtrar</Button>
          {appliedFilter && (
            <Button variant="secondary" size="sm" onClick={handleClear}>Limpar</Button>
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
    </div>
  )
}
