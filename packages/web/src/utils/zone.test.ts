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

  it('espalha os gêneros por mais de uma zona', () => {
    // O defeito do djb2 que motivou o FNV-1a: todo gênero caindo na mesma zona
    // e o catálogo inteiro saindo de uma cor só.
    const generos = ['Romance', 'Ficção Científica', 'História', 'Poema', 'Técnico', 'Infantil']
    expect(new Set(generos.map(zoneForGenre)).size).toBeGreaterThan(1)
  })

  it('mantém a zona de cada gênero entre versões', () => {
    // A zona é sinalização: trocar o hash repinta o acervo inteiro e desorienta
    // quem já associa a cor à seção. Mudar estes valores é decisão de design.
    expect(zoneForGenre('Romance')).toBe('ameixa')
    expect(zoneForGenre('Técnico')).toBe('verde')
    expect(zoneForGenre('Poema')).toBe('laranja')
  })
})

describe('zoneBackground', () => {
  it('mapeia a zona para a classe Tailwind correspondente', () => {
    const zona = zoneForGenre('Romance')
    expect(zoneBackground('Romance')).toBe(`bg-zone-${zona}`)
  })
})
