import { useEffect, useRef, type ReactNode } from 'react'
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

/**
 * Componente canônico de modal.
 * Gerencia foco, scroll-lock e fechamento por Esc e overlay.
 * Sempre use este componente — nunca criar dialog ad-hoc.
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
  const titleId   = `modal-title-${Math.random().toString(36).slice(2)}`

  // Fechar com Esc
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !persistent) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, persistent])

  // Scroll-lock no body quando modal está aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Foco automático no modal ao abrir
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={persistent ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        className="modal"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="text-lg font-semibold text-surface-900">
            {title}
          </h2>
          {!persistent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Fechar modal"
              className="!p-1"
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
