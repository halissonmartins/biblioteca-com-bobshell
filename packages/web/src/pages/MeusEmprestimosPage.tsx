import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getMyLoans } from '@/api/loans'
import { Table, Alert, LoadingPage, Badge } from '@/components'
import { formatDate, getErrorMessage } from '@/utils/format'
import type { LoanDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

const columns: Column<LoanDetail>[] = [
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
]

export function MeusEmprestimosPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'loans'],
    queryFn: getMyLoans,
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
      <h1 className="text-3xl font-bold mb-6">Meus Empréstimos</h1>
      <Table
        columns={columns}
        data={data ?? []}
        keyField="id"
        caption="Histórico de empréstimos"
        emptyMessage="Você não possui empréstimos registrados."
      />
    </div>
  )
}
