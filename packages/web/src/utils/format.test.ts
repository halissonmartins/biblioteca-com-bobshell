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
    // O ICU do Node separa data e hora com vírgula.
    expect(formatDateTime('2026-08-15T14:30:00Z')).toBe('15/08/2026, 14:30')
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

  it('converted nunca aparece como expirada', () => {
    const r = { status: 'converted' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(reservationState(r, agora)).toBe('convertida')
  })

  it('cancelled é exibida como expirada (hoje todo cancelled é RN-1)', () => {
    const r = { status: 'cancelled' as const, expiresAt: '2026-08-01T00:00:00Z' }
    expect(reservationState(r, agora)).toBe('expirada')
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
