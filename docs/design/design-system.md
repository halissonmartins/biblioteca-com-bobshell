# Design System — Sistema de Biblioteca

> Constituição da interface. O agente lê este documento antes de gerar qualquer UI.
> **Regra principal: nunca introduzir valor de cor, espaçamento, tipografia ou sombra fora dos tokens abaixo.**
> Implementação de referência: [`packages/web/src/`](../../packages/web/src/)

---

## Tokens

### Cores

| Token | Uso |
|---|---|
| `primary-500` | Ações principais: Reservar, Confirmar, Salvar |
| `primary-600` | Hover de primary |
| `primary-700` | Active/pressed de primary |
| `danger-500` | Ações destrutivas, mensagens de erro |
| `success-500` | Confirmações, disponibilidade (Cópia disponível) |
| `warning-500` | Alertas, reservas próximas de expirar |
| `surface-0` | Fundo de card, modal, input |
| `surface-50` | Fundo da página |
| `surface-100` | Fundo de input desabilitado, tabela zebrada |
| `surface-200` | Bordas padrão |
| `surface-700` | Texto secundário, labels, hints |
| `surface-900` | Texto principal, títulos |

Definição completa em [`tailwind.config.js`](../../packages/web/tailwind.config.js).

### Tipografia

Fonte: **Inter** (Google Fonts). Escala: `xs` `sm` `base` `lg` `xl` `2xl` `3xl`.

| Elemento | Classe |
|---|---|
| Título de página (h1) | `text-3xl font-bold` |
| Título de seção (h2) | `text-2xl font-semibold` |
| Título de card (h3) | `text-xl font-semibold` |
| Subtítulo (h4) | `text-lg font-medium` |
| Corpo | `text-base` (padrão) |
| Label de campo | `text-sm font-medium` |
| Texto auxiliar, hint | `text-xs text-surface-700` |

### Espaçamento

Apenas múltiplos de 4px (`p-1=4px`, `p-2=8px`, `p-3=12px`, `p-4=16px`, `p-6=24px`, `p-8=32px`, `p-10=40px`, `p-12=48px`). Nunca usar valores arbitrários (`p-[13px]`).

### Raio de borda

| Token | Uso |
|---|---|
| `rounded-sm` (4px) | Inputs pequenos |
| `rounded` (6px) | Botões, inputs padrão |
| `rounded-md` (8px) | Cards, dropdowns |
| `rounded-lg` (12px) | Cards grandes |
| `rounded-full` | Badges, avatares |

---

## Componentes canônicos

> **Regra:** o agente nunca cria `<button>`, `<input>` ou `<table>` com classes ad-hoc.
> Sempre usar os componentes abaixo. Importar de `@/components`.

| Componente | Arquivo | Quando usar |
|---|---|---|
| `<Button>` | [`Button.tsx`](../../packages/web/src/components/Button.tsx) | Todo elemento clicável de ação |
| `<Input>` | [`Input.tsx`](../../packages/web/src/components/Input.tsx) | Todo campo de texto, busca, e-mail |
| `<Form>` + `<Form.Field>` + `<Form.Actions>` | [`Form.tsx`](../../packages/web/src/components/Form.tsx) | Todo formulário |
| `<Table>` | [`Table.tsx`](../../packages/web/src/components/Table.tsx) | Toda lista de dados tabulares |
| `<Modal>` | [`Modal.tsx`](../../packages/web/src/components/Modal.tsx) | Confirmações, detalhes em overlay |
| `<Badge>` / `<CopyStatusBadge>` / `<ReservationStatusBadge>` / `<BookAvailabilityBadge>` | [`Badge.tsx`](../../packages/web/src/components/Badge.tsx) | Status de Cópia e Reserva, Disponibilidade de Livro |
| `<Alert>` | [`Alert.tsx`](../../packages/web/src/components/Alert.tsx) | Feedback de operação (sucesso, erro, aviso, info) |
| `<LoadingPage>` / `<EmptyState>` | [`Table.tsx`](../../packages/web/src/components/Table.tsx) | Estado de carregamento e lista vazia |

Showcase completo com exemplos reais: [`App.tsx`](../../packages/web/src/App.tsx).

### Mapeamento de status → badge

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

Não existe rótulo "Cancelada": ver [glossário](../produto/glossario.md), verbete
*Reserva expirada*.

---

## Padrões de estado

| Estado | Componente | Exemplo de uso |
|---|---|---|
| **Loading** | `<LoadingPage />` ou `<Button loading>` | Enquanto a API responde |
| **Vazio** | `<EmptyState message="…" />` | Lista sem resultados |
| **Erro** | `<Alert variant="error">` | Falha de API, validação |
| **Sucesso** | `<Alert variant="success">` | Reserva confirmada, devolução registrada |
| **Aviso** | `<Alert variant="warning">` | Reserva expirando em breve |
| **Desabilitado** | `disabled` prop no `<Button>` / `<Input>` | Cópia indisponível, campo não editável |

**Toda mensagem de erro de formulário** usa `<Input error="…">` (exibida sob o campo) — nunca toast ou alert genérico.
**Toda mensagem de feedback de operação** usa `<Alert>` — nunca texto solto na página.

---

## Acessibilidade obrigatória

Estes requisitos estão implementados nos componentes canônicos. Não contornar.

- **Contraste mínimo AA** — garantido pelos tokens de cor
- **Foco visível** em todo elemento interativo (`:focus-visible` configurado globalmente em `index.css`)
- **Todo `<Input>` tem `label` associado** — prop `label` é obrigatória no componente `Input`
- **`aria-live` / `role="alert"`** nos erros de campo e alertas de estado
- **Navegação por teclado** em `<Modal>`: Esc fecha, foco vai para o modal ao abrir
- **`aria-busy`** em tabelas e botões durante carregamento
- **`aria-disabled`** em botões desabilitados (não apenas `disabled`)

---

## Regras invioláveis

- **Nunca** usar valor de cor fora dos tokens (`text-blue-500` → `text-primary-500`)
- **Nunca** criar `<button>` ad-hoc → usar `<Button>`
- **Nunca** criar `<input>` sem label → usar `<Input label="…">`
- **Nunca** criar `<table>` ad-hoc → usar `<Table>`
- **Nunca** usar espaçamento arbitrário (`p-[13px]`) → usar escala de 4px
- **Nunca** omitir estado de loading e estado vazio em listas e botões assíncronos
- **Nunca** omitir estado de erro em formulários
