import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAuthor } from '@/api/authors'
import { Alert, LoadingPage, EmptyState, BookPlate } from '@/components'
import { getErrorMessage } from '@/utils/format'
import type { BookListItem } from '../../../shared/src/types/domain'

function MiniBookCard({ book }: { book: BookListItem }) {
  return (
    <Link
      to={`/livros/${book.id}`}
      className="card flex gap-3 p-3 transition-colors hover:border-surface-900
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-900"
      aria-label={`Ver detalhes de ${book.title}`}
    >
      <div className="shrink-0 w-16 h-24 overflow-hidden">
        <BookPlate
          title={book.title}
          author={book.author.name}
          genre={book.genre}
          coverUrl={book.coverUrl}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <h3 className="font-display text-base font-semibold uppercase tracking-placa text-surface-900 line-clamp-2 leading-tight">
          {book.title}
        </h3>
        <p className="legenda">{book.genre}</p>
        <div className="mt-auto">
          {book.availableCopies > 0 ? (
            <span className="badge-success">Disponível</span>
          ) : (
            <span className="badge-neutral">Indisponível</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function DetalhesAutorPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data: author, isLoading, isError, error } = useQuery({
    queryKey: ['author', slug],
    queryFn: () => getAuthor(slug!),
    enabled: !!slug,
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="error">{getErrorMessage(error)}</Alert>
      </div>
    )
  }

  if (!author) return null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-surface-700 mb-6" aria-label="Caminho">
        <Link to="/" className="hover:text-primary-600">Catálogo</Link>
        <span className="mx-2">/</span>
        <span className="text-surface-900">{author.name}</span>
      </nav>

      {/* Header do autor */}
      <div className="mb-8">
        <h1>{author.name}</h1>
        {author.bio && (
          <p className="text-sm text-surface-700 mt-3 leading-relaxed max-w-2xl">{author.bio}</p>
        )}
      </div>

      {/* Lista de livros */}
      <section aria-labelledby="author-books-heading">
        <h2 id="author-books-heading" className="mb-4">
          Livros publicados ({author.books.length})
        </h2>
        {author.books.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {author.books.map((book) => (
              <MiniBookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <EmptyState message="Nenhum livro cadastrado para este autor." />
        )}
      </section>
    </div>
  )
}
