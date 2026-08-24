/**
 * Testes da regra de Empréstimo aplicada no cliente (RN-8).
 * TZ fixo em UTC: as funções formata no fuso local de propósito.
 */

process.env.TZ = 'UTC'

import { describe, expect, it } from 'vitest'

import { LOAN_PERIOD_DAYS, defaultDueDate, dueDateToISO, todayInputValue } from './loan'

describe('LOAN_PERIOD_DAYS', () => {
  it('é a regra RN-8: 7 dias corridos', () => {
    expect(LOAN_PERIOD_DAYS).toBe(7)
  })
})

describe('todayInputValue', () => {
  it('devolve hoje em yyyy-MM-dd no fuso local', () => {
    expect(todayInputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const hoje = new Date()
    const esperado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    expect(todayInputValue()).toBe(esperado)
  })
})

describe('defaultDueDate', () => {
  it('soma LOAN_PERIOD_DAYS ao dia base', () => {
    expect(defaultDueDate(new Date('2026-08-15T12:00:00Z'))).toBe('2026-08-22')
  })

  it('atravessa o fim do mês sem pulo', () => {
    expect(defaultDueDate(new Date('2026-01-28T12:00:00Z'))).toBe('2026-02-04')
  })

  it('não adianta o dia à noite (UTC-3), diferente do toISOString', () => {
    // 21h locais em UTC-3 já são 00h do dia seguinte em UTC — o toISOString
    // pularia para o dia 16; o input precisa continuar mostrando o dia local.
    process.env.TZ = 'America/Sao_Paulo'
    try {
      expect(defaultDueDate(new Date('2026-08-15T21:00:00-03:00'))).toBe('2026-08-22')
      expect(new Date('2026-08-15T21:00:00-03:00').toISOString().slice(0, 10)).toBe('2026-08-16')
    } finally {
      process.env.TZ = 'UTC'
    }
  })
})

describe('dueDateToISO', () => {
  it('vira ISO no fim do dia local (23:59:59.999)', () => {
    process.env.TZ = 'America/Sao_Paulo'
    try {
      const iso = dueDateToISO('2026-08-22')
      const data = new Date(iso)
      expect(data.getFullYear()).toBe(2026)
      expect(data.getMonth()).toBe(7)
      expect(data.getDate()).toBe(22)
      expect(data.getHours()).toBe(23)
      expect(data.getMinutes()).toBe(59)
      expect(data.getSeconds()).toBe(59)
    } finally {
      process.env.TZ = 'UTC'
    }
  })
})
