/**
 * Testes dos formatadores e do estado exibido de Reserva (RN-1 no cliente).
 * TZ é fixado em UTC para que o dd/MM/yyyy não dependa da máquina que roda.
 */

process.env.TZ = 'UTC'

import { describe, expect, it } from 'vitest'

import {
  EXPIRING_SOON_MS,
  formatAvailableCopies,
  formatDate,
  formatDateTime,
  formatDuration,
  getErrorMessage,
  isExpiringSoon,
  isReservationActive,
  reservationState,
} from './format'

describe('formatDateTime / formatDate', () => {
  it('formata data e hora em pt-BR', () => {
    // O ICU do Node separa data e hora com vírgula. ISO sem `Z` é hora local:
    // o teste confere o formato em qualquer fuso. O `process.env.TZ` do topo não
    // basta — no pool `threads` (que o Stryker força) mudar TZ dentro do worker
    // não troca o fuso do ICU.
    expect(formatDateTime('2026-08-15T14:30:00')).toBe('15/08/2026, 14:30')
  })

  it('formata só a data em pt-BR', () => {
    expect(formatDate('2026-08-15T14:30:00Z')).toBe('15/08/2026')
  })
})

describe('formatAvailableCopies', () => {
  it('usa singular com uma Cópia', () => {
    expect(formatAvailableCopies(1)).toBe('1 cópia disponível')
  })

  it('usa plural com mais de uma Cópia', () => {
    expect(formatAvailableCopies(0)).toBe('0 cópias disponíveis')
    expect(formatAvailableCopies(7)).toBe('7 cópias disponíveis')
  })
})

describe('reservationState', () => {
  const agora = new Date('2026-08-15T12:00:00Z')

  it('status ausente vira ativa quando o prazo não passou', () => {
    const r = { expiresAt: '2026-08-15T13:00:00Z' }
    expect(reservationState(r, agora)).toBe('ativa')
  })

  it('envelhece para expirada entre um refetch e outro', () => {
    const r = { expiresAt: '2026-08-15T11:59:59Z' }
    expect(reservationState(r, agora)).toBe('expirada')
  })

  it('no instante exato do prazo já é expirada — mesma fronteira da API (RN-1)', () => {
    // A API recusa cancelar e efetivar com `expiresAt <= now`; a tela não pode
    // oferecer o botão nesse mesmo instante.
    const r = { expiresAt: agora.toISOString() }
    expect(reservationState(r, agora)).toBe('expirada')
  })

  it('converted nunca aparece como expirada', () => {
    const r = { status: 'converted' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(reservationState(r, agora)).toBe('convertida')
  })

  it('cancelled tem rótulo próprio: desistir não é deixar vencer (RF-L8)', () => {
    // Antes da issue #20 este caso caía em 'expirada', e com razão: o job de
    // expiração gravava em `cancelledAt` e todo cancelled era uma expiração. Com
    // o cancelamento pelo Leitor existindo, colapsar os dois diria "Expirada"
    // para a Reserva que ele acabou de cancelar.
    const r = { status: 'cancelled' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(reservationState(r, agora)).toBe('cancelada')
  })

  it('cancelled com prazo ainda no futuro continua cancelada, não ativa', () => {
    // É o caso normal do cancelamento: o Leitor desistiu ANTES das 12h. O
    // envelhecimento cliente-side só vale para 'ativa' — um desfecho do servidor
    // não pode ser rejuvenescido pelo relógio do navegador.
    const r = { status: 'cancelled' as const, expiresAt: '2026-08-15T23:00:00Z' }
    expect(reservationState(r, agora)).toBe('cancelada')
  })

  it('expired vem direto do servidor', () => {
    const r = { status: 'expired' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(reservationState(r, agora)).toBe('expirada')
  })
})

describe('isReservationActive / isExpiringSoon', () => {
  const agora = new Date('2026-08-15T12:00:00Z')

  it('é ativa dentro do prazo', () => {
    expect(isReservationActive({ expiresAt: '2026-08-16T00:00:00Z' }, agora)).toBe(true)
  })

  it('não é ativa fora do prazo', () => {
    expect(isReservationActive({ expiresAt: '2026-08-14T00:00:00Z' }, agora)).toBe(false)
  })

  it('avisa quando falta menos de uma hora', () => {
    const r = { expiresAt: new Date(agora.getTime() + EXPIRING_SOON_MS - 1_000).toISOString() }
    expect(isExpiringSoon(r, agora)).toBe(true)
  })

  it('avisa quando falta exatamente uma hora', () => {
    const r = { expiresAt: new Date(agora.getTime() + EXPIRING_SOON_MS).toISOString() }
    expect(isExpiringSoon(r, agora)).toBe(true)
  })

  it('não avisa um segundo antes de faltar uma hora', () => {
    const r = { expiresAt: new Date(agora.getTime() + EXPIRING_SOON_MS + 1_000).toISOString() }
    expect(isExpiringSoon(r, agora)).toBe(false)
  })

  it('não avisa quando o prazo está folgado', () => {
    const r = { expiresAt: new Date(agora.getTime() + 3 * EXPIRING_SOON_MS).toISOString() }
    expect(isExpiringSoon(r, agora)).toBe(false)
  })

  it('não avisa para Reserva que já virou Empréstimo', () => {
    const r = { status: 'converted' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(isExpiringSoon(r, agora)).toBe(false)
  })
})

describe('formatDuration', () => {
  const agora = new Date('2026-08-15T12:00:00Z')

  it('fala em dias acima de 24 h', () => {
    expect(formatDuration('2026-08-18T12:00:00Z', agora)).toBe('3 d')
  })

  it('24 h cravadas já são "1 d"', () => {
    expect(formatDuration('2026-08-16T12:00:00Z', agora)).toBe('1 d')
  })

  it('60 min cravados já são "1 h 0 min"', () => {
    expect(formatDuration('2026-08-15T13:00:00Z', agora)).toBe('1 h 0 min')
  })

  it('fala em horas e minutos abaixo de um dia', () => {
    expect(formatDuration('2026-08-15T23:51:00Z', agora)).toBe('11 h 51 min')
  })

  it('arredonda para minutos cheios', () => {
    expect(formatDuration('2026-08-15T12:47:00Z', agora)).toBe('47 min')
  })

  it('nunca devolve valor negativo', () => {
    expect(formatDuration('2026-08-15T09:00:00Z', agora)).toBe('3 h 0 min')
  })
})

describe('getErrorMessage', () => {
  it('extrai a mensagem de um Error', () => {
    expect(getErrorMessage(new Error('falhou'))).toBe('falhou')
  })

  it('tem fallback para quem não é Error', () => {
    expect(getErrorMessage('qualquer coisa')).toBe('Ocorreu um erro inesperado.')
  })
})
