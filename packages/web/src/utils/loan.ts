/**
 * Regra de produto do Empréstimo aplicada no cliente.
 *
 * RN-8 vive aqui por enquanto: `POST /loans` aceita qualquer `dueAt`, então o
 * padrão não é imposto pelo servidor. Este valor dispensa a digitação no caso
 * típico do balcão — o Bibliotecário continua podendo ajustar antes de confirmar.
 */

/** RN-8: Empréstimo vence 7 dias corridos após a efetivação */
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
