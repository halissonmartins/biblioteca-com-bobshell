import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAuthor } from '@/api/authors'
import { Alert, LoadingPage, EmptyState } from '@/components'
import { getErrorMessage } from '@/utils/format'
import type { BookListItem } from '../../../shared/src/types/domain'

function MiniBookCard({ book }: { book: BookListItem }) {
  return (
    <Link
      to={`/livros/${book.id}`}
      className="card hover:shadow-md transition-shadow flex gap-3 p-3"
      aria-label={`Ver detalhes de ${book.title}`}
    >
      <div className="shrink-0 w-12 h-16 bg-surface-100 rounded overflow-hidden flex items-center justify-center">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl" aria-hidden="true">📖</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-surface-900 line-clamp-2">{book.title}</p>
        <p className="text-xs text-surface-700 mt-1">{book.genre}</p>
        <p className={`text-xs mt-1 ${book.availableCopies > 0 ? 'text-success-600' : 'text-danger-500'}`}>
          {book.availableCopies > 0 ? 'Disponível' : 'Indisponível'}
        </p>
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
        <h1 className="text-3xl font-bold text-surface-900">{author.name}</h1>
        {author.bio && (
          <p className="text-sm text-surface-700 mt-3 leading-relaxed max-w-2xl">{author.bio}</p>
        )}
      </div>

      {/* Lista de livros */}
      <section aria-labelledby="author-books-heading">
        <h2 id="author-books-heading" className="text-xl font-semibold mb-4">
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
