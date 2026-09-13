import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { cancelReservation, getMyReservations } from '@/api/reservations'
import { Button, Modal, Table, Alert, LoadingPage, ReservationStatusBadge } from '@/components'
import { isApiRequestError } from '@/api/client'
import { useNow } from '@/hooks/useNow'
import {
  formatDateTime,
  formatDuration,
  isExpiringSoon,
  isReservationActive,
  reservationState,
  getErrorMessage,
} from '@/utils/format'
import type { ReservationDetail } from '../../../shared/src/types/domain'
import type { Column } from '@/components/Table'

/**
 * Traduz o erro do cancelamento para o que o Leitor precisa entender.
 *
 * Os dois casos que chegam aqui na prática nascem do mesmo lugar: a aba ficou
 * aberta e o mundo andou. O prazo venceu, ou o Bibliotecário efetivou o
 * Empréstimo enquanto o Leitor decidia — e em nenhum dos dois a resposta certa é
 * "tente de novo".
 */
function cancelErrorMessage(err: unknown): string {
  if (isApiRequestError(err)) {
    if (err.code === 'RESERVATION_EXPIRED') {
      return 'Esta reserva já expirou e a cópia voltou ao acervo — não há mais o que cancelar.'
    }
    if (err.code === 'CONFLICT') {
      return 'Esta reserva já foi encerrada. Se o livro já estiver com você, a devolução é feita no balcão.'
    }
    if (err.code === 'NOT_FOUND') {
      return 'Reserva não encontrada. Atualize a página e tente de novo.'
    }
    return err.message
  }
  return getErrorMessage(err)
}

function reservationColumns(
  onCancelar: (reservation: ReservationDetail) => void,
  now: Date,
): Column<ReservationDetail>[] {
  return [
    {
      key: 'book',
      header: 'Livro',
      render: (r) => (
        <Link
          to={`/livros/${r.copy.book.id}`}
          className="link-registro"
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
      key: 'expiresAt',
      header: 'Retire em até',
      // O prazo é a promessa do produto: o tempo que resta vem primeiro, a data
      // absoluta fica como referência para quem quer se programar. Uma Reserva
      // encerrada não tem prazo nenhum a mostrar.
      render: (r) =>
        reservationState(r, now) === 'ativa' ? (
          <span className="block text-right whitespace-nowrap">
            {/* Amarelo cromo é do prazo correndo (OWN-WORLD), em mono e colado
                na margem; a última hora escurece para o âmbar de aviso. */}
            <strong
              className={[
                'font-mono text-sm font-medium',
                isExpiringSoon(r, now) ? 'text-warning-800' : 'text-warning-700',
              ].join(' ')}
            >
              {formatDuration(r.expiresAt, now)}
            </strong>
            <br />
            <span className="text-xs text-surface-700">{formatDateTime(r.expiresAt)}</span>
          </span>
        ) : (
          <span className="text-sm text-surface-700">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ReservationStatusBadge state={reservationState(r, now)} expiringSoon={isExpiringSoon(r, now)} />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      // Só a Reserva viva pode ser desistida (RN-11), e `now` vem do tick: uma
      // Reserva que vence com a tela aberta perde o botão sozinha, sem esperar
      // refetch — o mesmo desenho do "Efetivar empréstimo" no balcão.
      render: (r) =>
        isReservationActive(r, now) ? (
          <Button variant="danger" size="sm" onClick={() => onCancelar(r)}>
            Cancelar
          </Button>
        ) : null,
    },
  ]
}

export function MinhasReservasPage() {
  const now = useNow()
  const queryClient = useQueryClient()

  const [cancelTarget, setCancelTarget] = useState<ReservationDetail | null>(null)
  const [cancelError, setCancelError]   = useState('')
  const [successMsg, setSuccessMsg]     = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'reservations'],
    queryFn: getMyReservations,
  })

  // RF-L8: o Leitor desiste e a Cópia volta ao acervo na hora
  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) => cancelReservation(reservationId),
    onSuccess: (reservation) => {
      setSuccessMsg(
        `Reserva de "${reservation.copy.book.title}" cancelada. ` +
          'A cópia voltou ao acervo e já está livre para outro leitor.',
      )
      setCancelTarget(null)
      setCancelError('')
      // A lista do Leitor só traz Reservas ativas, então a linha sai daqui no
      // refetch. A Disponibilidade do Livro subiu — invalidar `book` evita que a
      // página de detalhes mostre uma Cópia a menos do que o acervo tem.
      void queryClient.invalidateQueries({ queryKey: ['me', 'reservations'] })
      void queryClient.invalidateQueries({ queryKey: ['book'] })
    },
    // A seleção é preservada: o erro se resolve dentro do diálogo, sem obrigar o
    // Leitor a reencontrar a linha.
    onError: (err) => setCancelError(cancelErrorMessage(err)),
  })

  if (isLoading) return <LoadingPage />

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="error">{getErrorMessage(error)}</Alert>
      </div>
    )
  }

  const reservations = data ?? []
  const expiring = reservations.filter((r) => isExpiringSoon(r, now))

  function handleCancelar(reservation: ReservationDetail) {
    setSuccessMsg('')
    setCancelError('')
    setCancelTarget(reservation)
  }

  function handleClose() {
    setCancelTarget(null)
    setCancelError('')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 pb-4 border-b-2 border-surface-900">
        <h1>Minhas Reservas</h1>
      </div>

      {successMsg && (
        <Alert variant="success" className="mb-4">
          {successMsg}
        </Alert>
      )}

      {expiring.length > 0 && (
        <Alert variant="warning" title="Retirada urgente" className="mb-4">
          {expiring.length === 1
            ? `A reserva de "${expiring[0].copy.book.title}" expira em ${formatDuration(expiring[0].expiresAt, now)}.`
            : `${expiring.length} das suas reservas expiram em menos de 1 hora.`}{' '}
          Depois disso a cópia volta ao acervo e fica livre para outro leitor.
        </Alert>
      )}

      <Table
        columns={reservationColumns(handleCancelar, now)}
        data={reservations}
        keyField="id"
        caption="Suas reservas de livros"
        emptyMessage="Você não tem reservas ativas."
      />

      {/* Confirmação do cancelamento (RF-L8). `persistent` porque a Cópia volta
          ao acervo na hora e pode ser levada por outro Leitor em seguida: um
          clique perdido no fundo não pode ser o gatilho. */}
      <Modal
        open={cancelTarget !== null}
        onClose={handleClose}
        title="Cancelar reserva"
        persistent
        footer={
          <>
            <Button variant="secondary" onClick={handleClose}>
              Manter reserva
            </Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(cancelTarget!.id)}
            >
              {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar reserva'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-surface-700">
          Deseja cancelar a reserva de{' '}
          <strong className="text-surface-900">{cancelTarget?.copy.book.title}</strong>?
        </p>
        <Alert variant="warning" className="mt-4">
          A cópia volta ao acervo imediatamente e outro leitor pode reservá-la. Para
          ficar com o livro, você precisaria reservar de novo — se ainda houver cópia.
        </Alert>
        {cancelError && (
          <Alert variant="error" className="mt-4">
            {cancelError}
          </Alert>
        )}
      </Modal>
    </div>
  )
}
