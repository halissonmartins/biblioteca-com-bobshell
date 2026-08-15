/**
 * Nota de uma Avaliação, em marcas desenhadas.
 *
 * Antes eram glifos Unicode (★/☆) coloridos no amarelo cromo — dois problemas:
 * glifo não é sistema de ícone, e o cromo é a cor do prazo correndo, não de
 * uma nota. As marcas são grafite, no mesmo peso de traço do resto da chapa.
 */
export function Rating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Nota ${value} de ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={[
            'h-3.5 w-3.5 shrink-0',
            i < value ? 'text-surface-900' : 'text-surface-300',
          ].join(' ')}
          fill={i < value ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M8 1.5 10 6l4.5.5-3.4 3 1 4.5L8 11.7 3.9 14l1-4.5-3.4-3L6 6z" />
        </svg>
      ))}
    </span>
  )
}
