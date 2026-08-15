import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
  open:       boolean
  onClose:    () => void
  title:      string
  children:   ReactNode
  footer?:    ReactNode
  /** Impede fechar clicando no overlay — usar em operações destrutivas */
  persistent?: boolean
}

/** Elementos que recebem foco por Tab dentro do diálogo */
const FOCUSAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Componente canônico de modal.
 * Gerencia foco, scroll-lock e fechamento por Esc e overlay.
 * Sempre use este componente — nunca criar dialog ad-hoc.
 *
 * O foco fica preso enquanto o diálogo está aberto e volta para quem o abriu
 * ao fechar. Sem isso, `aria-modal="true"` mentia: o Tab caminhava para fora,
 * para a página atrás do overlay, e ao fechar o foco caía num link do trilho —
 * um Bibliotecário navegando por teclado perdia o lugar a cada operação.
 *
 * @example
 * <Modal
 *   open={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   title="Confirmar empréstimo"
 *   footer={
 *     <>
 *       <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancelar</Button>
 *       <Button variant="primary" onClick={handleLoan} loading={isLoaning}>Confirmar</Button>
 *     </>
 *   }
 * >
 *   <p>Confirmar empréstimo do livro para <strong>{reader.name}</strong>?</p>
 * </Modal>
 */
export function Modal({ open, onClose, title, children, footer, persistent = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // useId é estável entre renders; o Math.random() anterior trocava o id do
  // título a cada render e podia quebrar o aria-labelledby no meio do caminho.
  const titleId = useId()

  const focusaveis = useCallback((): HTMLElement[] => {
    const raiz = dialogRef.current
    if (!raiz) return []
    return Array.from(raiz.querySelectorAll<HTMLElement>(FOCUSAVEIS))
      .filter((el) => el.offsetParent !== null || el === document.activeElement)
  }, [])

  // Esc para fechar e Tab preso ao diálogo
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !persistent) {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const alvos = focusaveis()
      // Diálogo sem nada focável: o contêiner segura o foco sozinho.
      if (alvos.length === 0) {
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const primeiro = alvos[0]
      const ultimo = alvos[alvos.length - 1]
      const atual = document.activeElement

      if (!dialogRef.current?.contains(atual)) {
        e.preventDefault()
        ;(e.shiftKey ? ultimo : primeiro).focus()
        return
      }
      if (e.shiftKey && atual === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, persistent, focusaveis])

  // Scroll-lock no body quando modal está aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Foco entra no diálogo ao abrir e volta ao gatilho ao fechar
  useEffect(() => {
    if (!open) return
    const anterior = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    return () => {
      // Limitação conhecida: quando a própria operação remove o gatilho — a
      // Reserva vira Empréstimo e o botão "Efetivar empréstimo" deixa a linha —
      // ele ainda está conectado neste instante e só some depois do refetch,
      // então o foco acaba no body. Devolver a um elemento condenado é o
      // melhor que o Modal consegue decidir sozinho: quem sabe que a ação
      // apaga o próprio gatilho é a página, não o diálogo.
      if (anterior?.isConnected) anterior.focus()
      else document.querySelector<HTMLElement>('main')?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onClick={persistent ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="font-display text-xl font-semibold uppercase tracking-placa text-surface-0">
            {title}
          </h2>
          {!persistent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Fechar modal"
              className="!p-1 text-surface-0 hover:bg-primary-600"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          )}
        </div>

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
