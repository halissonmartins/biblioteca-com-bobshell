/**
 * Regra de produto do Empréstimo aplicada no cliente.
 *
 * O período padrão não vem do PRD nem da API: `POST /loans` aceita qualquer
 * `dueAt`. Este valor apenas dispensa a digitação no caso típico do balcão —
 * o Bibliotecário continua podendo ajustar a data antes de confirmar.
 */

/** Período padrão do Empréstimo, em dias corridos */
export const LOAN_PERIOD_DAYS = 7

/**
 * Converte Date para `yyyy-MM-dd` no fuso local.
 * `toISOString()` não serve aqui: em UTC-3 ele adianta o dia a partir das 21h.
 */
function toDateInputValue(date: Date): string {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Hoje no formato aceito por `<input type="date">` — piso do campo de vencimento */
export function todayInputValue(): string {
  return toDateInputValue(new Date())
}

/** Data de vencimento padrão: hoje + LOAN_PERIOD_DAYS */
export function defaultDueDate(from: Date = new Date()): string {
  const due = new Date(from)
  due.setDate(due.getDate() + LOAN_PERIOD_DAYS)
  return toDateInputValue(due)
}

/**
 * Converte `yyyy-MM-dd` do input para ISO 8601 no fim do dia local.
 * "Vence em 22/08" inclui o dia 22 inteiro — e evita que o vencimento apareça
 * como 21/08 nas listas, que é o que acontece ao interpretar a data como UTC.
 */
export function dueDateToISO(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}
