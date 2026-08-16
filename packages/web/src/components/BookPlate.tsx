import { useState } from 'react'
import { zoneBackground } from '@/utils/zone'

type PlateSize = 'card' | 'hero'

interface BookPlateProps {
  title: string
  author: string
  genre: string
  /** Capa real do acervo (ADR-0008). Sem ela — ou se a imagem falhar — vale a placa. */
  coverUrl?: string | null
  /** Código da Cópia ou ISBN — a placa de sinalização real sempre carrega o seu */
  code?: string | null
  size?: PlateSize
  /**
   * Quando a placa É o título do item na lista, ela precisa ser um heading de
   * verdade: como capa gerada ela desenha o título, mas a árvore de
   * acessibilidade não pode ficar sem ele.
   */
  asHeading?: boolean
}

/**
 * Capa de um Livro: a imagem do acervo quando ela existe, a placa tipográfica
 * quando não existe (ADR-0008).
 *
 * A placa não é um fallback triste: a zona de gênero dá a cor, o título dá a
 * forma, e duas placas nunca saem iguais porque dois Livros nunca têm o mesmo
 * título. Ela cobre o acervo de 250 mil Livros que nunca terá arte, e cobre
 * também a imagem que falhou em carregar — capa quebrada não vira ícone cinza.
 *
 * Sem ícone e sem emoji: essa parte da disciplina continua de pé.
 */
export function BookPlate({ title, author, genre, coverUrl, code, size = 'card', asHeading = false }: BookPlateProps) {
  const [imagemFalhou, setImagemFalhou] = useState(false)
  const hero = size === 'hero'
  const Titulo = asHeading ? 'h3' : 'p'

  if (coverUrl && !imagemFalhou) {
    return (
      <>
        {/* A imagem substitui o desenho do título, não o título: como item de
            lista o card continua precisando do heading na árvore de
            acessibilidade, e `alt` de imagem não cumpre esse papel. */}
        {asHeading && <h3 className="sr-only">{title}</h3>}
        <img
          src={coverUrl}
          alt={`Capa de ${title}`}
          // A chapa 2:3 é do card; a capa preenche sem distorcer, cortando o
          // que sobra quando a proporção do arquivo não bate exatamente.
          className="w-full h-full object-cover"
          loading={hero ? 'eager' : 'lazy'}
          fetchPriority={hero ? 'high' : 'auto'}
          decoding="async"
          onError={() => setImagemFalhou(true)}
        />
      </>
    )
  }

  // O título é a forma da placa, não uma legenda sob um bloco de cor.
  // O degrau considera a palavra mais longa, não só o total: "A Metamorfose"
  // tem 13 caracteres mas uma palavra de 11, e é a palavra que estoura a chapa
  // e força a quebra no meio.
  const length = title.length
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length))
  const apertado = length > 40 || longest > 12
  const medio = length > 22 || longest > 9
  // Degraus só da escala declarada em tailwind.config.js — `text-6xl` caía num
  // default do Tailwind, fora da rampa que o DESIGN.md documenta.
  const titleSize = hero
    ? apertado ? 'text-3xl' : medio ? 'text-4xl' : 'text-5xl'
    : apertado ? 'text-xl'  : medio ? 'text-2xl' : 'text-3xl'

  return (
    <div
      className={[
        zoneBackground(genre),
        'w-full h-full flex flex-col justify-between overflow-hidden',
        hero ? 'p-5' : 'p-3',
      ].join(' ')}
      aria-hidden={asHeading ? undefined : true}
    >
      {/* Topo da chapa: a zona e, quando existe, o código que o Bibliotecário
          procura na estante — é isso que uma placa de sinalização real carrega.
          Empilhados, não lado a lado: na largura do card os dois só cabiam na
          mesma linha abaixo do menor degrau da rampa tipográfica, e 9px não é
          tamanho de texto. */}
      <div className="shrink-0 flex flex-col gap-0.5">
        <p className="font-display text-xs uppercase tracking-legenda text-surface-0/85">
          {genre}
        </p>
        {code && <p className="font-mono text-xs text-surface-0/85">{code}</p>}
      </div>

      {/* O título sangra até a margem da chapa e ocupa o campo que sobrava:
          é a letra, não a cor da zona, que faz duas placas serem diferentes.
          `hyphens-auto` só funciona com o lang do documento correto (pt-BR);
          sem ele a palavra partia no meio sem hífen. */}
      <div className="shrink-0">
        <Titulo
          className={[
            'font-display font-bold uppercase text-surface-0 tracking-placa',
            'hyphens-auto [overflow-wrap:break-word]',
            hero ? 'leading-[0.88] mb-4' : 'leading-[0.92] mb-2.5',
            titleSize,
          ].join(' ')}
        >
          {title}
        </Titulo>
        <div className="h-px w-full bg-surface-0/35 mb-1.5" />
        <p className="font-sans text-xs text-surface-0/85 leading-tight sm:text-sm">
          {author}
        </p>
      </div>
    </div>
  )
}
