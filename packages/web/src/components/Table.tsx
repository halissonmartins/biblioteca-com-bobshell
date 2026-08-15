import { type ReactNode } from 'react'

// ============================================================
// Tipos
// ============================================================

export interface Column<T> {
  key:    string
  header: string
  render?: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns:    Column<T>[]
  data:       T[]
  keyField:   keyof T
  emptyMessage?: string
  loading?:   boolean
  caption?:   string  // acessibilidade: descreve o conteúdo da tabela
}

// ============================================================
// Componente canônico de tabela
// ============================================================

/**
 * Componente canônico de tabela.
 * Sempre use este componente para listas de dados tabulares.
 * Trata automaticamente os estados: loading, vazio e preenchido.
 *
 * @example
 * const columns: Column<Reservation>[] = [
 *   { key: 'bookTitle', header: 'Livro' },
 *   { key: 'expiresAt', header: 'Expira em', render: (r) => formatDate(r.expiresAt) },
 *   { key: 'actions', header: '', render: (r) => <Button size="sm">Emprestar</Button> },
 * ]
 * <Table columns={columns} data={reservations} keyField="id" emptyMessage="Nenhuma reserva ativa" />
 */
export function Table<T>({
  columns,
  data,
  keyField,
  emptyMessage = 'Nenhum resultado encontrado.',
  loading = false,
  caption,
}: TableProps<T>) {
  return (
    <div className="table-container" role="region" aria-label={caption} aria-busy={loading}>
      <table className="table table-empilha">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="flex items-center justify-center py-8 gap-2 text-surface-700">
                  <LoadingSpinner />
                  <span>Carregando…</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState message={emptyMessage} />
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={String(row[keyField])}>
                {columns.map((col) => (
                  <td key={col.key} data-coluna={col.header} className={col.className}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Primitivos de estado reutilizados pelo Table e por páginas
// ============================================================

export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={['animate-spin h-5 w-5 text-primary-500', className].join(' ')}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function EmptyState({ message, description }: { message: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-surface-700">
      <svg
        aria-hidden="true"
        className="h-10 w-10 text-surface-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
      <p className="text-sm font-medium">{message}</p>
      {description && <p className="text-xs text-surface-700">{description}</p>}
    </div>
  )
}

export function LoadingPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] gap-3 text-surface-700" role="status" aria-label="Carregando">
      <LoadingSpinner className="h-6 w-6" />
      <span className="text-sm">Carregando…</span>
    </div>
  )
}
