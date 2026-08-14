import { useState } from 'react'
import { Button, Input, Form, Table, Modal, Badge, CopyStatusBadge, ReservationStatusBadge, Alert } from './components'
import type { Column } from './components/Table'

// ============================================================
// Showcase canônico do Design System — Sistema de Biblioteca
// Cada seção é um exemplo real de uso dos componentes.
// O agente copia os padrões que encontra aqui.
// ============================================================

interface ReservationRow {
  id: string
  bookTitle: string
  expiresAt: string
  status: 'available' | 'reserved' | 'loaned'
}

const sampleData: ReservationRow[] = [
  { id: '1', bookTitle: 'O Senhor dos Anéis', expiresAt: '15/08/2026 14:00', status: 'reserved' },
  { id: '2', bookTitle: 'Dom Casmurro',        expiresAt: '16/08/2026 09:30', status: 'available' },
  { id: '3', bookTitle: 'Cem Anos de Solidão', expiresAt: '14/08/2026 22:00', status: 'loaned' },
]

const reservationColumns: Column<ReservationRow>[] = [
  { key: 'bookTitle', header: 'Livro' },
  { key: 'expiresAt', header: 'Expira em' },
  { key: 'status', header: 'Status', render: (r) => <CopyStatusBadge status={r.status} /> },
  {
    key: 'actions', header: '',
    render: () => <Button variant="secondary" size="sm">Emprestar</Button>,
  },
]

export default function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [email, setEmail]         = useState('')
  const [emailError, setEmailError] = useState('')

  function handleFakeSubmit() {
    if (!email.includes('@')) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setEmailError('')
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  return (
    <div className="min-h-screen bg-surface-50 p-6 sm:p-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-10">

        {/* Cabeçalho */}
        <header>
          <h1 className="text-3xl font-bold text-surface-900">Design System — Biblioteca</h1>
          <p className="mt-1 text-surface-700 text-sm">
            Showcase canônico. O agente copia os padrões que encontra aqui.
          </p>
        </header>

        {/* ── Botões ─────────────────────────────────────────── */}
        <section aria-labelledby="s-buttons">
          <h2 id="s-buttons" className="mb-4">Botões</h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Reservar</Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="danger">Excluir reserva</Button>
            <Button variant="ghost">Ver detalhes</Button>
            <Button variant="primary" size="sm">Sm</Button>
            <Button variant="primary" size="lg">Lg</Button>
            <Button variant="primary" loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500) }}>
              {loading ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button variant="primary" disabled>Desabilitado</Button>
          </div>
        </section>

        {/* ── Inputs e Form ──────────────────────────────────── */}
        <section aria-labelledby="s-form">
          <h2 id="s-form" className="mb-4">Formulário</h2>
          <div className="card max-w-md">
            <div className="card-body">
              <Form onSubmit={(e) => { e.preventDefault(); handleFakeSubmit() }}>
                <Form.Field>
                  <Input
                    label="Buscar livro"
                    placeholder="Título ou autor…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    hint="Busca por título, autor ou ISBN"
                  />
                </Form.Field>
                <Form.Field>
                  <Input
                    label="E-mail"
                    type="email"
                    placeholder="leitor@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={emailError}
                  />
                </Form.Field>
                <Form.Actions>
                  <Button variant="secondary" type="button">Cancelar</Button>
                  <Button variant="primary" type="submit">Entrar</Button>
                </Form.Actions>
              </Form>
            </div>
          </div>
        </section>

        {/* ── Alertas de estado ──────────────────────────────── */}
        <section aria-labelledby="s-alerts">
          <h2 id="s-alerts" className="mb-4">Estados (Alert)</h2>
          <div className="flex flex-col gap-3 max-w-md">
            <Alert variant="success" title="Reserva confirmada!">
              Retire o livro até <strong>15/08/2026 às 14h00</strong>.
            </Alert>
            <Alert variant="error">
              Sem cópias disponíveis no momento. Tente novamente mais tarde.
            </Alert>
            <Alert variant="warning" title="Reserva expirando">
              Sua reserva expira em <strong>30 minutos</strong>.
            </Alert>
            <Alert variant="info">
              O bibliotecário precisa estar presente para efetivar o empréstimo.
            </Alert>
          </div>
        </section>

        {/* ── Badges ─────────────────────────────────────────── */}
        <section aria-labelledby="s-badges">
          <h2 id="s-badges" className="mb-4">Badges de status</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <CopyStatusBadge status="available" />
            <CopyStatusBadge status="reserved" />
            <CopyStatusBadge status="loaned" />
            <ReservationStatusBadge active={true} />
            <ReservationStatusBadge active={false} />
            <Badge variant="neutral">Neutro</Badge>
          </div>
        </section>

        {/* ── Tabela ─────────────────────────────────────────── */}
        <section aria-labelledby="s-table">
          <h2 id="s-table" className="mb-4">Tabela de reservas</h2>
          <Table
            columns={reservationColumns}
            data={sampleData}
            keyField="id"
            caption="Reservas ativas do leitor"
            emptyMessage="Nenhuma reserva ativa"
          />
        </section>

        {/* ── Tabela vazia e loading ──────────────────────────── */}
        <section aria-labelledby="s-empty">
          <h2 id="s-empty" className="mb-4">Estados de tabela</h2>
          <div className="flex flex-col gap-4">
            <Table
              columns={reservationColumns}
              data={[]}
              keyField="id"
              emptyMessage="Nenhuma reserva ativa no momento."
            />
            <Table
              columns={reservationColumns}
              data={[]}
              keyField="id"
              loading={true}
            />
          </div>
        </section>

        {/* ── Modal ──────────────────────────────────────────── */}
        <section aria-labelledby="s-modal">
          <h2 id="s-modal" className="mb-4">Modal</h2>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Abrir modal de confirmação
          </Button>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Confirmar empréstimo"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>Confirmar empréstimo</Button>
              </>
            }
          >
            <p className="text-sm text-surface-700">
              Confirmar empréstimo de <strong className="text-surface-900">O Senhor dos Anéis</strong> para o leitor{' '}
              <strong className="text-surface-900">João Silva</strong>?
            </p>
            <Alert variant="info" className="mt-4">
              A reserva será convertida em empréstimo. O leitor pode retirar o livro agora.
            </Alert>
          </Modal>
        </section>

      </div>
    </div>
  )
}
