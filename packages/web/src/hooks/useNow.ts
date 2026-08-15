import { useEffect, useState } from 'react'

/**
 * Relógio que avança sozinho, para telas cujo conteúdo depende do tempo.
 *
 * Sem ele, o estado da Reserva congela no instante do render: uma aba deixada
 * aberta continua mostrando "Ativa" horas depois de a Cópia ter voltado ao
 * acervo — uma tela exibindo o que o balcão desmente.
 *
 * O intervalo padrão de 30 s mantém a granularidade de minutos honesta sem
 * custo perceptível. O timer é limpo na desmontagem.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
