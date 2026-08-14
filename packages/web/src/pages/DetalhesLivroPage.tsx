import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBook } from '@/api/books'
import { createReservation } from '@/api/reservations'
import { useAuth } from '@/hooks/useAuth'
import { Button, Modal, Alert, CopyStatusBadge, LoadingPage } from '@/components'
import { formatDateTime, getErrorMessage } from '@/utils/format'
import { isApiRequestError } from '@/api/client'

export function DetalhesLivroPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successMsg, setSuccessMsg]   = useState('')
  const [reserveError, setReserveError] = useState('')

  const { data: book, isLoading, isError, error } = useQuery({
    queryKey: ['book', id],
    queryFn: () => getBook(id!),
    enabled: !!id,
  })

  const reserveMutation = useMutation({
    mutationFn: () => createReservation({ bookId: id! }),
    onSuccess: (reservation) => {
      setConfirmOpen(false)
      setReserveError('')
      setSuccessMsg(
        `Reserva confirmada! Retire o livro até ${formatDateTime(reservation.expiresAt)}.`,
      )
      // Invalida a query do livro para atualizar disponibilidade
      void queryClient.invalidateQueries({ queryKey: ['book', id] })
    },
    onError: (err) => {
      setConfirmOpen(false)
      if (isApiRequestError(err)) {
        setReserveError(err.message)
      } else {
        setReserveError(getErrorMessage(err))
      }
    },
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="error">{getErrorMessage(error)}</Alert>
      </div>
    )
  }

  if (!book) return null

  const canReserve = isAuthenticated && user?.role === 'leitor' && book.availableCopies > 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-surface-700 mb-6" aria-label="Caminho">
        <Link to="/" className="hover:text-primary-600">Catálogo</Link>
        <span className="mx-2">/</span>
        <span className="text-surface-900">{book.title}</span>
      </nav>

      {/* Mensagens de feedback */}
      {successMsg && (
        <Alert variant="success" className="mb-6" title="Reserva confirmada!">
          {successMsg}
        </Alert>
      )}
      {reserveError && (
        <Alert variant="error" className="mb-6">
          {reserveError}
        </Alert>
      )}

      {/* Layout principal */}
      <div className="flex flex-col sm:flex-row gap-8">
        {/* Capa */}
        <div className="shrink-0 w-full sm:w-48">
          <div className="aspect-[2/3] bg-surface-100 rounded-lg overflow-hidden flex items-center justify-center">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={`Capa de ${book.title}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-6xl" aria-hidden="true">📖</span>
            )}
          </div>
        </div>

        {/* Detalhes */}
        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold text-surface-900">{book.title}</h1>
            <p className="mt-1 text-surface-700">
              por{' '}
              <Link
                to={`/autores/${book.author.slug}`}
                className="text-primary-600 hover:underline font-medium"
              >
                {book.author.name}
              </Link>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="badge-neutral">{book.genre}</span>
            {book.publishedAt && (
              <span className="badge-neutral">
                {new Date(book.publishedAt).getFullYear()}
              </span>
            )}
          </div>

          {/* Disponibilidade */}
          <div className="card p-4 flex items-center gap-3">
            <CopyStatusBadge status={book.availableCopies > 0 ? 'available' : 'loaned'} />
            <span className="text-sm text-surface-700">
              {book.availableCopies > 0
                ? `${book.availableCopies} cópia${book.availableCopies > 1 ? 's' : ''} disponível${book.availableCopies > 1 ? 'eis' : ''}`
                : 'Sem cópias disponíveis no momento'}
            </span>
          </div>

          {/* Sinopse */}
          {book.synopsis && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Sinopse</h2>
              <p className="text-sm text-surface-700 leading-relaxed">{book.synopsis}</p>
            </div>
          )}

          {/* Ação de reserva */}
          {isAuthenticated && user?.role === 'leitor' && (
            <div className="mt-2">
              <Button
                variant="primary"
                disabled={!canReserve}
                onClick={() => {
                  setSuccessMsg('')
                  setReserveError('')
                  setConfirmOpen(true)
                }}
              >
                {book.availableCopies > 0 ? 'Reservar' : 'Indisponível'}
              </Button>
              {book.availableCopies === 0 && (
                <p className="text-xs text-surface-700 mt-2">
                  Nenhuma cópia disponível para reserva.
                </p>
              )}
            </div>
          )}

          {!isAuthenticated && (
            <Alert variant="info" className="mt-2">
              <Link to="/login" className="font-medium underline">Entre</Link> para reservar este livro.
            </Alert>
          )}
        </div>
      </div>

      {/* Avaliações recentes */}
      {book.recentReviews.length > 0 && (
        <section className="mt-10" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="text-xl font-semibold mb-4">Avaliações</h2>
          <div className="flex flex-col gap-3">
            {book.recentReviews.map((review) => (
              <div key={review.id} className="card card-body">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm text-surface-900">{review.user.name}</span>
                  <span className="text-warning-500 text-sm" aria-label={`Nota ${review.rating} de 5`}>
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </span>
                  <span className="text-xs text-surface-700 ml-auto">{formatDateTime(review.createdAt)}</span>
                </div>
                <p className="text-sm text-surface-700">{review.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal de confirmação de reserva */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar reserva"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={reserveMutation.isPending}
              onClick={() => reserveMutation.mutate()}
            >
              {reserveMutation.isPending ? 'Reservando…' : 'Confirmar reserva'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-surface-700">
          Deseja reservar <strong className="text-surface-900">{book.title}</strong>?
        </p>
        <Alert variant="info" className="mt-4">
          A reserva expira automaticamente em <strong>12 horas</strong> se o livro não for retirado.
        </Alert>
      </Modal>
    </div>
  )
}
