/** Formata data ISO 8601 para dd/MM/yyyy HH:mm (fuso local) */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Formata data ISO 8601 para dd/MM/yyyy */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Retorna true se a reserva está activa (não expirada, não cancelada, não convertida) */
export function isReservationActive(expiresAt: string, convertedAt: string | null, cancelledAt: string | null): boolean {
  if (convertedAt || cancelledAt) return false
  return new Date(expiresAt) > new Date()
}

/** Retorna a mensagem de erro amigável de um ApiRequestError genérico */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Ocorreu um erro inesperado.'
}
