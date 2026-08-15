---
name: Biblioteca
description: Sinalização cívica esmaltada que leva o Leitor até UMA Cópia específica num acervo de 250 mil.
colors:
  primary: "#7B1E24"
  primary-hover: "#661319"
  primary-pressed: "#520E13"
  primary-wash: "#FAF1F1"
  success: "#12664A"
  success-ink: "#0A3D2C"
  warning: "#E8A200"
  warning-ink: "#8A5E00"
  danger: "#C0341B"
  danger-ink: "#7F1D0F"
  surface-plate: "#FFFFFF"
  surface-porcelain: "#F2F4F3"
  surface-field: "#E7EAE8"
  surface-rule: "#D3D8D5"
  surface-rule-strong: "#9BA5A0"
  surface-ink-muted: "#3C4441"
  surface-ink: "#16191A"
  zone-verde: "#12664A"
  zone-petroleo: "#12545F"
  zone-indigo: "#2B3A72"
  zone-laranja: "#A8471B"
  zone-ameixa: "#5B2B58"
  zone-oliva: "#4A5320"
typography:
  display:
    fontFamily: '"Barlow Condensed", Haettenschweiler, Impact, sans-serif'
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: "2.75rem"
    letterSpacing: "0.08em"
  headline:
    fontFamily: '"Barlow Condensed", Haettenschweiler, Impact, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.875rem"
    letterSpacing: "0.08em"
  title:
    fontFamily: '"Barlow Condensed", Haettenschweiler, Impact, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "0.08em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "normal"
  label:
    fontFamily: '"Barlow Condensed", Haettenschweiler, Impact, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.14em"
  code:
    fontFamily: '"Azeret Mono", ui-monospace, monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
rounded:
  none: "0"
  sm: "2px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
  16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-plate}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-active:
    backgroundColor: "{colors.primary-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface-plate}"
    textColor: "{colors.surface-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-sm:
    padding: "8px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-plate}"
    textColor: "{colors.surface-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px"
    width: "100%"
  card:
    backgroundColor: "{colors.surface-plate}"
    textColor: "{colors.surface-ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.surface-plate}"
    textColor: "{colors.surface-ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 10px 4px 8px"
  zona-rail:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-plate}"
    typography: "{typography.title}"
    width: "240px"
  zona-link-active:
    backgroundColor: "{colors.surface-porcelain}"
    textColor: "{colors.primary-pressed}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  modal-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-plate}"
    typography: "{typography.title}"
    padding: "16px 24px"
---

# Design System: Biblioteca

> **Supersede.** `docs/design/design-system.md` descreve o mundo anterior (azul Tailwind `#3b82f6`, Inter, cards arredondados, sombra suave, badges em pílula). Aquele arquivo está **superado para tokens e receitas de componente** — este DESIGN.md e `packages/web/tailwind.config.js` são a fonte de verdade. O arquivo antigo permanece no repositório e não foi reescrito aqui; trate qualquer valor dele como histórico até que seja atualizado ou removido.

## Overview

**Creative North Star: "A Chapa de Esmalte Vitrificado"**

Esta interface se lê como o prédio da biblioteca se lê por dentro: sinalização cívica esmaltada, aparafusada na parede, que existe para levar uma pessoa até um lugar físico. Não há grade de cards com miniatura de capa e sombra suave — o mundo recusa explicitamente esse padrão, que é o que todo catálogo entrega e o que este repositório entregava antes. O campo é porcelana fria (`#F2F4F3`), a tinta é grafite, e um trilho oxblood drenado (`#7B1E24`) corre pela lateral carregando a navegação em caixa alta condensada branca.

A densidade é de registro operacional, não de vitrine. O Bibliotecário passa oito horas na mesma tela: por isso a cor de estado nunca lava o campo de leitura — ela vive no filete e no ícone, e o texto fica acromático. A hierarquia é feita de peso, caixa e filete, nunca de elevação: a chapa é plana e a separação é uma linha de 1px. O amarelo cromo (`#E8A200`) pertence exclusivamente ao prazo correndo; o verde sinal (`#12664A`) à Disponibilidade. Nenhuma outra cor pode assumir esses cargos.

A capa de Livro é uma **placa tipográfica gerada** de título, autor, gênero e código — sem imagem, sem ícone, sem emoji. É essa disciplina que dá ao acervo de 250 mil Livros uma superfície visual sem depender de arte que não existe: duas placas nunca saem iguais porque dois Livros nunca têm o mesmo título.

**Key Characteristics:**
- Campo porcelana fria, nunca creme — o material é esmalte, não papel
- Cantos duros de 2px; a pílula está banida da interface
- Zero sombra, exceto o Modal que realmente flutua
- Barlow Condensed em caixa alta espaçada faz toda a voz de sinalização
- Cor de estado no filete e no ícone; campo de texto acromático
- Codificação por zona de gênero derivada por hash, seis cores, oxblood excluído

## Colors

Uma paleta de esmalte industrial: um oxblood drenado de autoridade, três esmaltes de sinal com cargo fixo, um neutro verde-acinzentado de porcelana, e uma família de zonas para codificação de gênero.

### Primary
- **Oxblood Drenado** (`primary`): a cor do trilho de navegação e de **toda ação principal** — Reservar, Confirmar Empréstimo, Registrar Devolução. Também é o campo cheio do cabeçalho de Modal e a cor de link de Autor. Sua raridade fora do trilho é o que faz a ação primária ser lida à distância.
- **Oxblood Fundo / Prensado** (`primary-hover`, `primary-pressed`): hover e estado pressionado de botões e links do trilho. O ativo do trilho usa o prensado sobre porcelana.
- **Lavagem Oxblood** (`primary-wash`): único fundo tingido permitido — hover do botão fantasma.

### Secondary
- **Verde Sinal** (`success`): **Disponibilidade**, e só ela. Cópia disponível, Reserva ativa, Reserva convertida.
- **Amarelo Cromo** (`warning`): **o prazo correndo**, e só ele. Cópia reservada, Reserva expirando. Também é a cor de `::selection` do documento — o navegador faz parte da sinalização.
- **Vermelho Sinal** (`danger`): falha e ação destrutiva. Deliberadamente mais claro e mais laranja que o oxblood para nunca ser confundido com "ação principal".

Cada esmalte tem um tom de tinta escuro (`success-ink`, `warning-ink`, `danger-ink`) usado para o **texto** do chip, enquanto o tom 500 fica no filete e no ícone.

### Tertiary
- **Zonas do Acervo** (`zone-verde`, `zone-petroleo`, `zone-indigo`, `zone-laranja`, `zone-ameixa`, `zone-oliva`): seis esmaltes escuros que codificam gênero, do jeito que a sinalização de um prédio público separa seções. Todos passam AA com texto branco por cima. São o campo da placa de Livro e o fundo das faixas de gênero.

### Neutral
- **Chapa de Conteúdo** (`surface-plate`): fundo de card, input, Modal, corpo de tabela.
- **Porcelana Fria** (`surface-porcelain`): fundo da página, e o campo do estado ativo invertido.
- **Campo Fresado** (`surface-field`): cabeçalho de tabela, hover de linha, input desabilitado, trilho da barra de rolagem.
- **Filete Padrão** (`surface-rule`) e **Filete Forte** (`surface-rule-strong`): bordas, divisores e placeholder. Fazem todo o trabalho que a sombra faria.
- **Tinta Secundária** (`surface-ink-muted`) e **Grafite** (`surface-ink`): texto auxiliar e texto principal. Grafite também é a cor do anel de foco e da marca cheia de Avaliação.

### Named Rules
**A Regra do Cargo Fixo.** Cromo é prazo. Verde é Disponibilidade. Oxblood é ação principal e navegação. Nenhuma dessas cores pode ser reaproveitada para decoração, ênfase genérica ou dado neutro.

**A Regra do Campo Acromático.** Nenhum bloco de texto recebe fundo colorido. A cor de estado entra pelo filete de borda e pelo ícone; o campo de leitura permanece chapa branca com tinta grafite. Vale para chips, alertas e linhas de tabela.

**A Regra do Oxblood Excluído.** Oxblood nunca é cor de zona. Uma placa de Livro em oxblood leria como "este Livro é o menu"; o hash de gênero sorteia entre as seis zonas restantes.

## Typography

**Display Font:** Barlow Condensed (com Haettenschweiler, Impact)
**Body Font:** Barlow (com system-ui)
**Label/Mono Font:** Azeret Mono (com ui-monospace)

**Character:** Uma condensada de sinalização, sempre em caixa alta e sempre com abertura de letra, contra uma grotesca humanista neutra que carrega toda a prosa. A monoespaçada aparece só onde há um código a copiar ou um número a alinhar. A voz é a de uma placa aparafusada: curta, alta, imperativa.

### Hierarchy
- **Display** (700, 2.75rem, altura 1:1, caixa alta, `letterSpacing` de placa): título de página. É a chapa que nomeia a tela.
- **Headline** (600, 1.5rem, caixa alta): título de seção — Sinopse, Avaliações, Reservas ativas.
- **Title** (600, 1.25rem, caixa alta): título de card, título de Modal, rótulo de link do trilho, texto de botão.
- **Subtítulo** (Barlow 600, 1.125rem, caixa mista): o único cargo de título que **não** usa a condensada — usado quando o texto é conteúdo e não sinalização.
- **Body** (400, 1rem / 1.5rem): toda a prosa, célula de tabela e valor de campo.
- **Label** (600, 0.75rem, caixa alta, `letterSpacing` de legenda): a classe `legenda` — rótulo de campo, cabeçalho de tabela, chip de status, contagem de resultados, rótulo de coluna na tabela empilhada.
- **Code** (Azeret Mono 400): código de Cópia, ISBN, número de página, hora de expiração.

Números são tabulares em toda a interface (tabela, `.font-mono`, `<time>`): código, prazo e contagem precisam alinhar coluna a coluna.

### Named Rules
**A Regra das Duas Vozes.** Condensada em caixa alta é voz de sinalização: título, botão, rótulo, navegação, chip. Barlow em caixa mista é voz de conteúdo: prosa, dado, nome de pessoa. Um parágrafo em condensada, ou um botão em caixa mista, quebra o mundo.

**A Regra da Caixa Alta Aberta.** Nada em caixa alta anda sem `letterSpacing`: 0.08em para placa (títulos, botões, navegação), 0.14em para legenda (rótulos miúdos). Caixa alta apertada lê como erro de renderização.

**A Regra do `lang`.** A placa tipográfica depende de `hyphens-auto` para quebrar títulos longos com hífen. Isso **só funciona com `lang="pt-BR"` no `<html>`**; sem o atributo a palavra parte no meio sem hífen. Esse atributo é parte do sistema visual, não configuração incidental — foi um defeito real neste build.

## Layout

O shell é um trilho de zona fixo e um campo de conteúdo. A partir de `lg` (1024px) o trilho é uma coluna fixa de 240px colada à esquerda em altura total, e o conteúdo compensa com 240px de recuo à esquerda; abaixo disso o trilho vira uma placa de duas linhas grudada no topo (identificação e ação em cima, zonas em faixa rolável embaixo). A tela de entrada (login) não tem trilho e não recebe o recuo.

O conteúdo é centrado com largura máxima por tipo de tela: catálogo em contêiner largo (`max-w-7xl`), páginas de leitura como detalhe do Livro em contêiner estreito (`max-w-4xl`). O padding horizontal é 16px no celular e 24px a partir de `sm`, com 32px de respiro vertical.

O ritmo de espaçamento é estritamente múltiplo de 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Valores arbitrários fora dessa escala não entram.

A grade do catálogo é de placas em proporção 2:3, escalando 2 colunas no celular, 3 em `sm`, 4 em `md`, 5 em `xl`, com 12px de gap no celular e 16px acima. A densidade sobe com a largura porque a placa continua legível reduzida: o título é a forma, não uma legenda sob uma imagem.

**A Regra da Ficha no Celular.** Abaixo de `sm` (640px) toda tabela empilha: o cabeçalho vira leitura de tela apenas, cada linha vira uma ficha com borda inferior, e cada célula imprime seu rótulo à esquerda a partir de `data-coluna`. A célula sem cabeçalho é a das ações e ocupa a linha inteira. Sem isso a coluna de ação do balcão desaparecia num overflow horizontal silencioso.

## Elevation & Depth

**Este sistema não usa elevação.** A chapa é plana. A escala de sombra do Tailwind foi deliberadamente anulada — `sm`, `DEFAULT`, `md` e `lg` são todas `none`, para que um `shadow-md` copiado de qualquer outro código não consiga introduzir profundidade acidentalmente. A profundidade é feita por filete de 1px, borda de cor e mudança de campo tonal (porcelana → chapa branca → campo fresado).

### Shadow Vocabulary
- **Modal** (`box-shadow: 0 24px 64px -12px rgb(22 25 26 / 0.45)`): a única sombra do sistema. Existe porque o Modal é a única superfície que realmente flutua sobre a página, sobre um overlay grafite a 70%.

### Named Rules
**A Regra da Chapa Plana.** Separação é filete, não elevação. Se uma superfície precisa se destacar, ela ganha borda, muda de tom ou inverte — nunca levanta.

## Shapes

Esmalte é cortado, não moldado. O raio existe para não ferir, não para suavizar: **2px em tudo** — botão, input, card, tabela, alerta, Modal, faixa de gênero. `rounded-full` sobreviveu na escala por uma única razão: o spinner de carregamento. Chips e links do trilho são explicitamente `rounded-none`, canto vivo.

Bordas são hairline (1px) em filete neutro, e a única espessura maior no sistema é a borda de 2px do estado ativo invertido e o filete grafite de 2px sob o título de página no catálogo. Nenhuma borda decorativa, nenhum gradiente, nenhum recorte.

A silhueta recorrente é o retângulo de proporção 2:3 da placa de Livro, e a barra horizontal de filete que separa cabeçalho de corpo.

## Components

### Buttons
- **Shape:** canto duro (2px), sem sombra, condensada em caixa alta espaçada.
- **Primary:** chapa oxblood cheia com tinta branca, 20px/10px de padding. É a ação que o produto quer que aconteça.
- **Hover / Focus:** hover escurece a chapa (transição de cor de 100ms, nunca de transform); foco visível é contorno grafite de 2px com 2px de offset.
- **Secondary:** chapa branca com filete `surface-rule-strong` e tinta grafite; hover vai ao campo fresado.
- **Danger:** chapa vermelho sinal cheia. **Ghost:** transparente com tinta oxblood, hover na lavagem oxblood.
- **Tamanhos:** `sm` carrega piso de 44px de altura de alvo (o balcão é mouse, mas o Leitor é polegar); `lg` engorda para 32px/16px.
- **Estado de carga:** `aria-busy` e spinner inline; o botão desabilita a si mesmo.

### Chips (Badge)
- **Style:** quadrado (`rounded-none`), chapa branca, **filete de cor só na borda esquerda**, texto no tom escuro do esmalte, tipografia de legenda.
- **State:** quatro variantes de cargo — sucesso (Disponibilidade, Reserva ativa/convertida), aviso (Cópia reservada, Reserva expirando), perigo (Cópia emprestada), neutro (cancelada, expirada, indisponível). O status é sempre texto do glossário, nunca só cor.

#### Mapeamento de status → chip

Um estado nunca empresta o rótulo de outro: uma Reserva convertida em Empréstimo
é um sucesso e jamais aparece como expirada.

| Situação | Componente | Variante | Rótulo |
|---|---|---|---|
| Cópia disponível | `<CopyStatusBadge status="available">` | `success` | Disponível |
| Cópia reservada | `<CopyStatusBadge status="reserved">` | `warning` | Reservado |
| Cópia emprestada | `<CopyStatusBadge status="loaned">` | `danger` | Emprestado |
| Reserva ativa | `<ReservationStatusBadge state="ativa">` | `success` | Ativa |
| Reserva a < 1 h do prazo | `<ReservationStatusBadge state="ativa" expiringSoon>` | `warning` | Expira em breve |
| Reserva virou Empréstimo | `<ReservationStatusBadge state="convertida">` | `success` | Convertida |
| Reserva encerrada sem retirada | `<ReservationStatusBadge state="expirada">` | `neutral` | Expirada |
| Livro com Disponibilidade | `<BookAvailabilityBadge availableCopies={n}>` | `success` / `neutral` | Disponível / Indisponível |

`<BookAvailabilityBadge>` existe porque a API entrega apenas a contagem de Cópias
de um Livro (`BookDetail.availableCopies`), sem os estados individuais — usar
`<CopyStatusBadge>` ali obrigava a inventar um status e imprimia "Emprestado"
para Cópias que estavam apenas reservadas.

Não existe rótulo "Cancelada": ver [glossário](docs/produto/glossario.md), verbete
*Reserva expirada*.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** chapa branca sobre campo porcelana.
- **Shadow Strategy:** nenhuma. Ver Elevation & Depth.
- **Border:** filete `surface-rule` de 1px. O card do catálogo escurece a borda para grafite no hover — a borda é o único indicador de interatividade.
- **Internal Padding:** 16px no celular, 24px a partir de `sm`.

### Inputs / Fields
- **Style:** campo fresado na chapa — fundo branco, filete `surface-rule-strong`, 2px de raio, 12px de padding, placeholder no filete forte.
- **Focus:** a borda vai a grafite e ganha anel de 1px grafite.
- **Error:** borda e anel em vermelho sinal; a mensagem sai abaixo em `role="alert"`.
- **Label obrigatório.** O componente canônico exige `label`; o rótulo usa tipografia de legenda e fica acima do campo, ligado por `htmlFor`. Hint e erro são ligados por `aria-describedby`.

### Navigation (Trilho de Zona)
- **Style:** chapa oxblood cheia, links em condensada caixa alta a 75% de opacidade branca, canto vivo, sem ícone.
- **Hover:** campo oxblood fundo, texto a 100%.
- **Active:** **inversão pura** — o link imprime porcelana com tinta oxblood prensada, como uma placa acesa. A chapa inteira vira o indicador; não há filete de destaque. `aria-current` acompanha.
- **Focus:** contorno branco de 2px com offset negativo, para não vazar da chapa.
- **Mobile:** trilho no topo em duas linhas, zonas em faixa rolável horizontal; nunca espremidas numa linha só (rótulo cortado lê como defeito).

### Faixas de Gênero
A codificação de zona virou controle de filtro. Cada faixa é um botão com o campo da sua zona e texto branco a 90% de opacidade; ativo usa **a mesma inversão do trilho** — porcelana com borda grafite de 2px. Piso de 44px de altura. O dispositivo mais novo não inventa um estado próprio.

### Table
- **Style:** contêiner com filete e canto de 2px; cabeçalho em campo fresado com tipografia de legenda; divisores hairline; hover de linha em campo fresado; alinhamento superior.
- **Estados automáticos:** carregando (spinner + `aria-busy` na região) e vazio (mensagem própria) são responsabilidade do componente, não da página.
- **Mobile:** empilha em fichas — ver a Regra da Ficha no Celular.

### Modal
Overlay grafite a 70%, chapa branca, a única sombra do sistema. O **cabeçalho é uma placa oxblood cheia** com título em condensada branca — a identidade vem do campo de cor, não de um filete no topo. Rodapé separado por filete, ações alinhadas à direita. Fecha por Esc e por overlay (salvo `persistent`), trava o scroll do corpo e move o foco para o diálogo.

### Alert
Chapa branca com filete de contorno na cor do estado e ícone SVG na cor do estado; o texto fica grafite. Título opcional em condensada caixa alta. Sempre `role="alert"`.

### Rating
A nota de Avaliação é desenhada em marcas SVG grafite (cheias) e filete (vazias), no mesmo peso de traço do resto da chapa, com rótulo acessível. Não usa glifo Unicode e não usa cromo — cromo é prazo, não nota.

### BookPlate (componente de assinatura)
A capa gerada. Um campo na cor da zona do gênero, com o gênero em legenda no topo à esquerda, o código da Cópia ou ISBN em mono no topo à direita, o título sangrando até a margem em condensada bold caixa alta, um filete branco a 35% e o autor embaixo.

O corpo do título tem três degraus, calculados por **comprimento total e pela palavra mais longa** (uma palavra de 11 caracteres estoura a chapa mesmo num título curto): folgado, médio e apertado, em duas escalas — `card` para a grade e `hero` para a página de detalhe. A quebra usa `hyphens-auto` e depende do `lang` do documento (ver a Regra do `lang`).

`asHeading` existe porque, quando a placa é o título do item numa lista, ela precisa ser um heading de verdade: como capa gerada ela desenha o título, mas a árvore de acessibilidade não pode ficar sem ele. Quando não é heading, a placa inteira é `aria-hidden` e o título vem do texto adjacente.

A zona é derivada do gênero por **FNV-1a de 32 bits com avalanche final**, entre as seis zonas não-oxblood. Mesmo gênero, mesma zona, sempre — nunca um mapa fixo, que ficaria desatualizado no primeiro gênero novo. O hash anterior (djb2) colidia sistematicamente e jogava todos os gêneros numa cor só; se o algoritmo mudar, a distribuição precisa ser verificada de novo.

## Do's and Don'ts

### Do:
- **Do** construir toda UI a partir dos componentes canônicos (`Button`, `Input`, `Table`, `Modal`, `Badge`, `Alert`, `Rating`, `BookPlate`) e das classes de `index.css`. Copiar, não reinventar.
- **Do** usar exatamente os termos do glossário na interface: Livro, Cópia, Leitor, Bibliotecário, Reserva, Empréstimo, Devolução, Disponibilidade, Avaliação. **Catálogo e Acervo são termos distintos e não são intercambiáveis** — trocá-los foi um defeito real neste build.
- **Do** manter cromo para prazo e verde para Disponibilidade, sempre acompanhados do rótulo em texto.
- **Do** dar `label` a todo campo, foco visível a todo interativo, `role="alert"` a toda mensagem de estado e `aria-busy` a todo carregamento.
- **Do** usar inversão para porcelana como o estado ativo de qualquer controle de navegação ou filtro.
- **Do** manter `lang="pt-BR"` no `<html>`; a quebra hifenizada da placa depende disso.
- **Do** manter 44px de altura mínima em controles que o Leitor toca no celular.

### Don't:
- **Don't** introduzir sombra. A escala está anulada de propósito; `shadow-modal` é a única exceção e pertence ao Modal.
- **Don't** arredondar além de 2px, e nunca usar pílula (`rounded-full`) fora do spinner.
- **Don't** lavar um bloco de texto com cor de estado. O filete e o ícone carregam a cor; o campo fica acromático.
- **Don't** usar imagem, ícone decorativo ou emoji como capa ou identidade de Livro — a placa tipográfica é o padrão, não o fallback.
- **Don't** usar glifo Unicode (★, ✓, →) como ícone; ícone é SVG inline.
- **Don't** usar oxblood como cor de zona de gênero, nem cromo como cor de nota ou de ênfase genérica.
- **Don't** escrever prosa em Barlow Condensed nem botão em caixa mista.
- **Don't** criar `<button>`, `<input>` ou `<table>` ad-hoc, nem valores arbitrários de cor, espaçamento ou raio fora dos tokens.
- **Don't** tratar `docs/design/design-system.md` como fonte de tokens; ele descreve o mundo anterior.

## Verificação em aberto

Registrado como estado conhecido, **não como orientação**:

- **Contraste não verificado por máquina.** Os tokens foram escolhidos para AA e as zonas foram desenhadas para passar com texto branco, mas o detector empacotado roda DEGRADED neste ambiente (sem módulos de parser HTML). Nenhum par foi confirmado automaticamente.
- **Alvos de toque não auditados** além do piso de 44px em `.btn-sm` e nas faixas de gênero.
- **A lista de gêneros das faixas** é derivada da primeira página não filtrada do catálogo, porque a API não expõe endpoint de gêneros. A lista é, portanto, parcial por construção.
