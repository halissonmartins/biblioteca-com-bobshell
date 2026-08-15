---
target: packages/web/src
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-15T11-20-09Z
slug: packages-web-src
---
# Crítica de Design — `packages/web/src`

**Method: dual-agent** (A: revisão de design isolada · B: detector + evidência de browser)
Modo: **Operate**. Alvo: SPA React do sistema de biblioteca (8 páginas).

## Design Health Score — 16/40 (Poor)

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | Zero estado ativo de nav (nenhum `NavLink`/`aria-current`); `isReservationActive()` calculado uma vez no render — "Ativa" nunca degrada |
| 2 | Correspondência mundo real | 2 | `"2 cópias disponíveleis"` (`CatalogoPage.tsx:35`, `DetalhesLivroPage.tsx:128`); filtros do balcão exigem UUID |
| 3 | Controle e liberdade | 1 | Leitor não pode cancelar Reserva em lugar nenhum |
| 4 | Consistência e padrões | 2 | `<button>` ad-hoc em `CatalogoPage.tsx:117,128`, `BibliotecarioReservasPage.tsx:88,92`, `BibliotecarioEmprestimosPage.tsx:191,193` |
| 5 | Prevenção de erros | 1 | Mesmo Leitor reserva 2 Cópias do mesmo Livro (visível em `bibliotecario-reservas.png`) |
| 6 | Reconhecer vs. lembrar | 1 | Gênero em texto livre; filtros por UUID |
| 7 | Flexibilidade e eficiência | 1 | Sem atalho, ação de linha, lote ou data de vencimento padrão |
| 8 | Estética e minimalismo | 3 | Zero hex hardcoded / zero style inline; mas `max-w-6xl` desperdiça o widescreen |
| 9 | Recuperação de erros | 2 | `onError` faz `setLoanTarget(null)` (`BibliotecarioEmprestimosPage.tsx:133`); erro cru longe do modal |
| 10 | Ajuda e documentação | 1 | Regra das 12h explicada em um único modal |

Notas recalibradas vs. Assessment A (que somou 15): estética 2→3.

## Veredito de Especificidade

**Casca CRUD intercambiável.** Troque "Livro" por "Fatura" e "Reserva" por "Aprovação" e cada tela funciona sem alteração.
- Catálogo = grade de dez 📖 idênticos (`CatalogoPage.tsx:25`), ~65% da área visível carregando zero informação, em 750k views/mês.
- Promessa híbrida visível só no Alert do modal de reserva. `minhas-reservas.png` degrada o contrato de 12h a um timestamp em célula de tabela.
- `bibliotecario-reservas.png` é tabela somente-leitura sem nenhuma ação. O balcão não tem balcão.
- Caráter real, mínimo: breadcrumb, autor linkado, coluna `Cópia` (`9780156027748-C2`).
- `PRODUCT.md` libera explicitamente a paleta/emoji como placeholders; a liberdade não foi usada.

**Detector CLI:** exit 2, 1 achado — `overused-font` (Inter) em `index.css:1`. Não é falso positivo.

**Detector em browser real (o que o estático não vê):** `low-contrast 3.7:1 — #ffffff on #3b82f6` = a receita `.btn-primary` (`index.css:60-64`). 1× no Catálogo, 2× no Login. O botão primário do produto reprova em AA. Somado a `success-600` ≈3,3:1 e `danger-500` ≈3,8:1, as três cores portadoras de significado reprovam.

**Geometria medida @375px:** `btn-sm` 28px/fonte 12px; `.btn` 36px; `.input` 38px/fonte 14px. Nenhum alvo alcança 44×44px. `.btn-lg` (único que passa) não é usado em lugar nenhum.

**Falso positivo derrubado pelo próprio Assessment B:** o overflow horizontal reportado no 1º passe era artefato do overlay injetado. Sem injeção, `/` e `/login` estão limpos em 320/375/768px.

**Convergência independente:** `App.css` é scaffold morto do Vite (6 blocos `@media`, importado por ninguém). Responsividade real = 23 prefixos Tailwind; só `sm` + um `md`/`lg` na mesma linha (`CatalogoPage.tsx:108`). `Table.tsx` — primitiva de 4 páginas — tem zero tratamento responsivo além de `overflow-x:auto`.

**Overlay:** renderizou durante o run; live-server e Vite encerrados ao final. Nenhum overlay visível agora.

## Carga Cognitiva — 7 de 8 falham

Falham: foco único, chunking ≤4, agrupamento (card de Disponibilidade na linha 124 separado do botão Reservar na 144 pela Sinopse inteira), hierarquia visual (Reservar é `px-4 py-2 text-sm`, mais leve que a fileira de pills acima), uma coisa por vez, ≤4 opções, memória de trabalho (UUID carregado entre páginas). Passa: revelação progressiva (catálogo → detalhe → modal).

Pontos de decisão com >4 opções: grade de 20 cards sem ordenação/faceta; lista de rádio com **todas as reservas ativas do sistema** em `max-h-48` (`BibliotecarioEmprestimosPage.tsx:277-298`); navbar com 5 alvos; tabela de 5 colunas × linhas não paginadas; grade de livros do Autor sem limite.

## O Que Está Funcionando

1. **Modal de confirmação de reserva** (`DetalhesLivroPage.tsx:193-218`) — revelação temporizada no momento do compromisso, objeto em negrito, consequência única em Alert distinto, botões rotulados por verbo e corretamente pesados.
2. **Acessibilidade forçada em tipos** — `Input` tem `label: string` não-opcional (campo sem rótulo não compila); `Button` emite `aria-disabled` + `aria-busy`; `Table` tem `role="region"` + `<caption>` sr-only; `:focus-visible` global. 36 `aria-*`, 6 `role=`.
3. **Disciplina de tokens absoluta** — zero hex hardcoded e zero `style={{}}` em 2.558 linhas. Torna as correções baratas.

## Problemas Prioritários

### [P0] Bibliotecário não tem caminho da Reserva ao Empréstimo
`BibliotecarioReservasPage.tsx` = 5 colunas somente-leitura, sem coluna de ação. O Empréstimo nasce em outra rota via `+ Novo empréstimo`, cujo modal re-busca todas as reservas ativas num `max-h-48` sem busca, e exige data digitada (`loanDueAt` começa `''`). Com 10.000 Leitores a lista fica inutilizável. Princípio 4 orça isso em segundos, com uma pessoa esperando de pé.
**Fix:** coluna de ações com `Efetivar empréstimo` por linha ativa; modal abre com Reserva/Leitor/Cópia já vinculados e data pré-preenchida. `+ Novo empréstimo` vira só o caminho walk-up, com busca por Leitor.
**Comando:** `/impeccable shape`

### [P0] Três indicadores de status afirmam coisas falsas
(a) `ReservationStatusBadge` (`Badge.tsx:44-48`) só aceita `active: boolean` → imprime "Expirada" para convertida, cancelada e expirada; `bibliotecario-reservas.png` mostra uma Reserva convertida rotulada como expirada. (b) `CopyStatusBadge status={availableCopies > 0 ? 'available':'loaned'}` imprime "Emprestado" para Cópias apenas *reservadas* — estado que o componente já suporta (`Badge.tsx:16`). (c) `isReservationActive()` (`format.ts:22-25`) nunca reavalia. Viola o Princípio 1, que é o posicionamento inteiro do produto.
**Fix:** estado real com 4 badges (`Convertida` = success); status real da Cópia; tick por minuto + tempo relativo ("expira em 11 h 51 min"). `warning-500` e `Alert variant="warning"` já existem documentados para isso e nunca foram usados.
**Comando:** `/impeccable harden`

### [P1] Catálogo não funciona com 250.000 Livros
Query a cada tecla sem debounce (`CatalogoPage.tsx:55-58`); gênero em texto livre com match exato; paginação só prev/next = 12.500 páginas; estado em `useState`, não na URL (refresh/compartilhar/voltar perdem tudo).
**Fix:** debounce ~300ms; `<select>` de gêneros (ou chips filtráveis, já renderizados no detalhe); primeira/última + números; `useSearchParams`.
**Comando:** `/impeccable optimize`

### [P1] Leitor acumula Cópias do mesmo Livro e não cancela nenhuma
Sem guarda contra re-reserva; `Reservar` segue habilitado após sucesso; nenhuma ação de cancelar existe (grep "cancel" só retorna leituras de `cancelledAt`). Cada duplicata bloqueia uma Cópia por 12h (RN-4) e infla a métrica `< 20% expiradas`.
**Fix:** substituir o botão por link para Minhas Reservas quando já houver Reserva ativa; ação `Cancelar reserva` por linha com modal de confirmação.
**Comando:** `/impeccable onboard`

### [P1] Contraste, alvos de toque e `lang` contradizem o piso declarado
`.btn-primary` 3,7:1 medido; `success-600` ≈3,3:1 e `danger-500` ≈3,8:1 em `text-xs` como únicos portadores da disponibilidade (sub-AA + só-por-cor); `placeholder-surface-300` ≈1,6:1; nenhum alvo ≥44px (menor: 28px); inputs 38px/14px; `<html lang="en">` num produto pt-BR; `Modal` sem focus trap e sem restauração de foco (`Modal.tsx:59-61`) apesar de `aria-modal="true"`. O `PRODUCT.md` nomeia contraste AA e teclado no Modal como prática vinculante a não regredir.
**Comando:** `/impeccable audit`

## Bandeiras Vermelhas por Persona

**Alex (= o Bibliotecário):** fetch frio a cada operação (`enabled: showNewLoan`) com `<p>Carregando reservas…</p>` cru em vez do `LoadingSpinner`; data vazia em todo empréstimo; filtro de Empréstimos aceita só ID enquanto o de Reservas aceita ID ou e-mail; sem Enter-para-submeter, sem ação de linha, sem estado ativo de nav; `max-w-6xl` desperdiça o widescreen.

**Riley:** `getAllReservations()`/`getAllLoans()` não paginados; filtros fora da URL perdem estado no voltar; títulos longos com `line-clamp-2` nos cards e **sem clamp** nas tabelas do balcão; `MinhasReservasPage` vazia = 4 cabeçalhos sobre zero linhas sem caminho adiante; corrida pela última Cópia entrega string crua da API enquanto o card ainda diz "2 cópias disponíveleis".

**Sam:** `lang="en"`; sem focus trap nem restauração de foco; nenhum `aria-current`; lista de rádio sem `<fieldset>`/`<legend>`; `role="alert"` em Alert informativo estático (interrupção assertiva a cada render); `⚠️` sem rótulo em datas vencidas.

**Casey:** `Navbar.tsx` sem colapso responsivo (logo + 3 links + Sair em `h-14` fixo, sem wrap); catálogo `grid-cols-2` de `aspect-[2/3]` = ~10 telas verticais de emoji idêntico para 20 livros.

## Observações Menores

- `App.css` + `src/assets/{hero.png,react.svg,vite.svg}` = scaffold morto dentro da "implementação de referência" do design system.
- `Modal` usa `Math.random()` para `titleId` (`Modal.tsx:36`); `Input.tsx:19` já usa `useId()`.
- `text-lg` vs `text-xl` em h2 irmãos; o design system manda `text-2xl`.
- Prop `persistent` do `Modal` implementada e nunca usada — a Devolução fecha com clique perdido no overlay.
- `alt=""` em `DetalhesAutorPage.tsx:17` vs `alt="Capa de …"` nas outras duas páginas.
- `badge-neutral` serve chip de gênero e status terminal.
- `getErrorMessage` devolve `err.message` cru ao usuário final.
- `spacing: {}` vazio em `tailwind.config.js:69-73` — a escala de 4px só existe no comentário.
- Sem dark mode: nenhum token ou variante `dark:`.

## Perguntas Para Considerar

1. Se o Bibliotecário nunca precisasse buscar, a tela do balcão mudaria de forma? Duas tabelas por entidade onde o trabalho é por pessoa — e se a home fosse "Atender leitor" resolvendo para a página de um Leitor com ações inline?
2. O que é um prazo de 12h que vence às 08:09 se a biblioteca abre às 09:00? Expressar em horário de funcionamento pode mover a métrica de expiradas mais que qualquer polimento.
3. Os pixels mais valiosos do catálogo são dez 📖 idênticos. E se a capa fosse gerada dos dados do Livro (título + autor + cor por gênero)? Custo zero de asset, 750k views/mês.
4. "Fonte única de verdade" é o posicionamento — por que o Leitor nunca vê as Cópias individuais, como a coluna do Bibliotecário já mostra?
