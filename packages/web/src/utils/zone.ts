/**
 * Codificação de zona por gênero.
 *
 * A sinalização de um prédio público separa seções por cor, e o gênero é a
 * seção do acervo. Os gêneros são texto livre e o acervo tem 250 mil Livros,
 * então a cor é derivada da string — nunca de um mapa fixo que ficaria
 * desatualizado no primeiro gênero novo. Mesmo gênero, mesma zona, sempre.
 */

/**
 * Oxblood fica de fora de propósito: é a cor do trilho de navegação, e uma
 * placa de Livro em oxblood leria como "este Livro é o menu".
 */
export const ZONES = ['verde', 'petroleo', 'indigo', 'laranja', 'ameixa', 'oliva'] as const

export type Zone = (typeof ZONES)[number]

/** Classes estáticas para o Tailwind enxergar — nunca montar nome de classe por concatenação */
const ZONE_BG: Record<Zone, string> = {
  verde:    'bg-zone-verde',
  petroleo: 'bg-zone-petroleo',
  indigo:   'bg-zone-indigo',
  laranja:  'bg-zone-laranja',
  ameixa:   'bg-zone-ameixa',
  oliva:    'bg-zone-oliva',
}

const ZONE_BORDER: Record<Zone, string> = {
  verde:    'border-zone-verde',
  petroleo: 'border-zone-petroleo',
  indigo:   'border-zone-indigo',
  laranja:  'border-zone-laranja',
  ameixa:   'border-zone-ameixa',
  oliva:    'border-zone-oliva',
}

/**
 * FNV-1a de 32 bits com avalanche final.
 *
 * O djb2 usado antes colidia de forma sistemática neste módulo: os cinco
 * gêneros do acervo caíam todos na mesma zona e o catálogo inteiro saía de uma
 * cor só, matando justamente a codificação por zona que o mundo promete.
 */
export function zoneForGenre(genre: string): Zone {
  let hash = 0x811c9dc5
  for (let i = 0; i < genre.length; i += 1) {
    hash ^= genre.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d) >>> 0
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b) >>> 0
  hash = (hash ^ (hash >>> 16)) >>> 0
  return ZONES[hash % ZONES.length]
}

export function zoneBackground(genre: string): string {
  return ZONE_BG[zoneForGenre(genre)]
}

export function zoneBorder(genre: string): string {
  return ZONE_BORDER[zoneForGenre(genre)]
}
