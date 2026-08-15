import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listBooks } from '@/api/books'
import { Input, Alert, Button, LoadingPage, EmptyState, BookPlate } from '@/components'
import { formatAvailableCopies, getErrorMessage } from '@/utils/format'
import { zoneBackground } from '@/utils/zone'
import type { BookListItem } from '../../../shared/src/types/domain'

function BookCard({ book }: { book: BookListItem }) {
  return (
    <Link
      to={`/livros/${book.id}`}
      className="group card flex flex-col transition-colors hover:border-surface-900
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-900"
      aria-label={`Ver detalhes de ${book.title}`}
    >
      <div className="aspect-[2/3] overflow-hidden">
        <BookPlate
          title={book.title}
          author={book.author.name}
          genre={book.genre}
          coverUrl={book.coverUrl}
          code={book.isbn}
          asHeading
        />
      </div>
      {/* O pé da placa é a legenda da chapa: só disponibilidade, em borda dura */}
      <div className="border-t border-surface-200 px-3 py-2.5">
        {book.availableCopies > 0 ? (
          <span className="badge-success">{formatAvailableCopies(book.availableCopies)}</span>
        ) : (
          <span className="badge-neutral">Indisponível</span>
        )}
      </div>
    </Link>
  )
}

export function CatalogoPage() {
  const [search, setSearch]   = useState('')
  const [genre, setGenre]     = useState('')
  const [page, setPage]       = useState(1)
  // As faixas vêm do primeiro carregamento sem filtro. A API não expõe a lista
  // de gêneros do acervo; enquanto não expuser, a faixa cobre o que o Catálogo
  // realmente mostrou — nunca uma string que o Leitor tinha de adivinhar.
  const [generos, setGeneros] = useState<string[]>([])
  const pageSize = 20

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['books', search, genre, page],
    queryFn: () => listBooks({ search: search || undefined, genre: genre || undefined, page, pageSize }),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    if (generos.length > 0 || !data || search || genre) return
    setGeneros([...new Set(data.data.map((b) => b.genre))].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  }, [data, generos.length, search, genre])

  function handleSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleGenre(value: string) {
    setGenre(value)
    setPage(1)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 pb-4 border-b-2 border-surface-900">
        <h1>Catálogo de Livros</h1>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-col gap-4">
        <Input
          label="Buscar"
          placeholder="Título, autor ou ISBN…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />

        {/* Faixas de gênero: a codificação por zona vira o próprio controle,
            em vez de um campo de texto onde era preciso adivinhar a string. */}
        <div>
          <p className="legenda mb-2" id="faixas-genero">Gênero</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="faixas-genero">
            <button
              type="button"
              onClick={() => handleGenre('')}
              aria-pressed={genre === ''}
              className={[
                'faixa-genero',
                genre === ''
                  ? 'bg-surface-50 text-surface-900 border-2 border-surface-900'
                  : 'bg-surface-100 text-surface-700 border border-surface-300',
              ].join(' ')}
            >
              Todos
            </button>
            {generos.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGenre(g)}
                aria-pressed={genre === g}
                // Ativo é inversão para porcelana, a mesma regra do trilho —
                // o dispositivo mais novo não pode inventar um estado próprio.
                className={[
                  'faixa-genero',
                  genre === g
                    ? 'bg-surface-50 text-surface-900 border-2 border-surface-900'
                    : `text-surface-0 ${zoneBackground(g)} opacity-90 hover:opacity-100`,
                ].join(' ')}
              >
                {g}
              </button>
            ))}
          </div>
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
              <p className="legenda mb-4">
                {data.pagination.total} livro{data.pagination.total !== 1 ? 's' : ''} encontrado{data.pagination.total !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {data.data.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>

              {/* Paginação */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-10 pt-6 border-t border-surface-200">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    aria-label="Página anterior"
                  >
                    Anterior
                  </Button>
                  <span className="legenda whitespace-nowrap">
                    Página <span className="font-mono text-surface-900">{page}</span> de{' '}
                    <span className="font-mono text-surface-900">{data.pagination.totalPages}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    aria-label="Próxima página"
                  >
                    Próxima
                  </Button>
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
