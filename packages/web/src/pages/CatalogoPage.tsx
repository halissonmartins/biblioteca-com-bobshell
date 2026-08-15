import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listBooks } from '@/api/books'
import { Input, Alert, LoadingPage, EmptyState } from '@/components'
import { formatAvailableCopies, getErrorMessage } from '@/utils/format'
import type { BookListItem } from '../../../shared/src/types/domain'

function BookCard({ book }: { book: BookListItem }) {
  return (
    <Link
      to={`/livros/${book.id}`}
      className="card hover:shadow-md transition-shadow flex flex-col"
      aria-label={`Ver detalhes de ${book.title}`}
    >
      {/* Capa */}
      <div className="aspect-[2/3] bg-surface-100 rounded-t-md overflow-hidden flex items-center justify-center">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={`Capa de ${book.title}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl" aria-hidden="true">📖</span>
        )}
      </div>
      {/* Info */}
      <div className="card-body flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-surface-900 line-clamp-2">{book.title}</h3>
        <p className="text-xs text-surface-700">{book.author.name}</p>
        <p className="text-xs text-surface-700 mt-auto">{book.genre}</p>
        <p className={`text-xs font-medium mt-1 ${book.availableCopies > 0 ? 'text-success-600' : 'text-danger-500'}`}>
          {book.availableCopies > 0 ? formatAvailableCopies(book.availableCopies) : 'Indisponível'}
        </p>
      </div>
    </Link>
  )
}

export function CatalogoPage() {
  const [search, setSearch]   = useState('')
  const [genre, setGenre]     = useState('')
  const [page, setPage]       = useState(1)
  const pageSize = 20

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['books', search, genre, page],
    queryFn: () => listBooks({ search: search || undefined, genre: genre || undefined, page, pageSize }),
    placeholderData: (prev) => prev,
  })

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleGenre(value: string) {
    setGenre(value)
    setPage(1)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Catálogo de Livros</h1>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <Input
            label="Buscar"
            placeholder="Título, autor ou ISBN…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            hint="Busca por título, autor ou ISBN"
          />
        </div>
        <div className="sm:w-48">
          <Input
            label="Gênero"
            placeholder="Ex: Romance"
            value={genre}
            onChange={(e) => handleGenre(e.target.value)}
          />
        </div>
      </div>

      {/* Estado de erro */}
      {isError && (
        <Alert variant="error" className="mb-6">
          {getErrorMessage(error)}
        </Alert>
      )}

      {/* Estado de carregamento */}
      {isLoading && <LoadingPage />}

      {/* Grid de livros */}
      {!isLoading && !isError && (
        <>
          {data && data.data.length > 0 ? (
            <>
              <p className="text-sm text-surface-700 mb-4">
                {data.pagination.total} livro{data.pagination.total !== 1 ? 's' : ''} encontrado{data.pagination.total !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {data.data.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>

              {/* Paginação */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                  >
                    ← Anterior
                  </button>
                  <span className="text-sm text-surface-700">
                    Página {page} de {data.pagination.totalPages}
                  </span>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    aria-label="Próxima página"
                  >
                    Próxima →
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              message="Nenhum livro encontrado."
              description="Tente ajustar os filtros de busca."
            />
          )}
        </>
      )}
    </div>
  )
}
