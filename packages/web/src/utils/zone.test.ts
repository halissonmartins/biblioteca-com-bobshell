/**
 * Testes da codificação de zona por gênero.
 * O contrato é determinismo: mesmo gênero, mesma zona, sempre — e a zona
 * resultante é sempre uma das seis placas conhecidas.
 */

import { describe, expect, it } from 'vitest'

import { ZONES, zoneBackground, zoneForGenre } from './zone'

describe('zoneForGenre', () => {
  it('devolve sempre uma zona válida para gêneros variados', () => {
    const generos = ['Romance', 'Ficção Científica', 'História', 'Poema', 'Técnico', 'Infantil']
    for (const genero of generos) {
      expect(ZONES).toContain(zoneForGenre(genero))
    }
  })

  it('é determinística: mesmo gênero, mesma zona', () => {
    expect(zoneForGenre('Romance')).toBe(zoneForGenre('Romance'))
    expect(zoneForGenre('romance')).toBe(zoneForGenre('romance'))
  })
})

describe('zoneBackground', () => {
  it('mapeia a zona para a classe Tailwind correspondente', () => {
    const zona = zoneForGenre('Romance')
    expect(zoneBackground('Romance')).toBe(`bg-zone-${zona}`)
  })
})
