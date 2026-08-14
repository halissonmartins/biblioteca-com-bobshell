# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Sobre o projeto

Sistema web híbrido de biblioteca: Leitor reserva on-line, Bibliotecário efetiva empréstimo presencialmente.
250k livros, 10k leitores ativos. Leia o PRD antes de implementar qualquer feature.

- PRD: [`docs/prd-sistema-biblioteca.md`](docs/prd-sistema-biblioteca.md)
- Glossário: [`docs/produto/glossario.md`](docs/produto/glossario.md) — use **exatamente** estes termos no código
- User stories: [`docs/produto/user-stories.md`](docs/produto/user-stories.md)
- Arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md) — leia antes de criar arquivo novo
- Design system: [`docs/design/design-system.md`](docs/design/design-system.md) *(a criar em P2)*

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Express + TypeScript strict |
| Frontend | React 18 + TypeScript strict |
| Banco | PostgreSQL 15 + Prisma ORM |
| Testes | Vitest (unit/integração) + Playwright (e2e) |
| CI/CD | GitHub Actions + Docker |

## Comandos

```bash
make setup    # instala deps + docker compose up + migrate + seed
make dev      # API (porta 3000) + Web (porta 5173) em watch
make test     # Vitest — todos os testes unitários e de integração
make lint     # ESLint + TypeScript typecheck
make build    # build de produção
```

**Rodar um único teste:**
```bash
npx vitest run packages/api/src/domain/reservation/reservation.test.ts
npx playwright test e2e/reservation.spec.ts
```

## Regras de negócio críticas (não violar — derivadas do PRD)

- Reserva expira automaticamente após **12 horas** (RN-1)
- Empréstimo só pode ser efetivado por **`bibliotecario`**, nunca pelo `leitor` (RN-2, RN-7)
- Reserva só pode ser criada se houver **Cópia com `status = 'available'`** (RN-3)
- Cópia reservada fica **`status = 'reserved'`** — bloqueada para outros leitores (RN-4)
- Apenas reservas ativas (não expiradas) podem ser convertidas em Empréstimo (RN-6)
- Toda transação de reserva/empréstimo/devolução usa `BEGIN/COMMIT` explícito (race condition)

## Convenções obrigatórias

- **`any` explícito é proibido** — TypeScript strict em toda a base de código
- **Toda rota nova** declara o papel permitido e tem **teste de autorização** (papel errado → 403)
- **Nunca editar migration já aplicada** — criar nova migration que corrige
- **Nunca desabilitar lint/tipo/teste** para fazer build ou CI passar
- **Toda mudança de schema** exige migration versionada em `packages/api/prisma/migrations/`
- Commits seguem **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Toda variável de ambiente nova vai para `.env.example` no mesmo PR

## Terminologia — use os termos do glossário no código

`Livro` `Cópia` `Leitor` `Bibliotecário` `Reserva` `Empréstimo` `Devolução` `Disponibilidade` `Avaliação`

Nunca usar: "exemplar", "aluguel", "reservação", "membro", "retorno" — ver glossário completo.

## Performance — guiar decisões de implementação

- Tela de detalhes do livro: **< 300 ms** (25:1 leitura/escrita — índice em `copies(book_id, status)`)
- Reserva / empréstimo / devolução: **< 3 s**
- Disponibilidade deve ser consistente entre Leitor e Bibliotecário (fonte única de verdade)

## Regras invioláveis

- Nunca commitar segredos (`.env` está no `.gitignore`)
- `domain/` não importa nada de `infra/` nem de bibliotecas HTTP/banco — ver `ARCHITECTURE.md`
- Todo acesso ao banco passa por `infra/repositories/` — nenhuma rota acessa o banco diretamente
- Protótipo e PoC são descartáveis — não promover para produção sem reimplementar com fundações

## Hook: Registro de Prompts

**Regra obrigatória:** Ao receber qualquer mensagem do usuário, ANTES de processar a resposta, append o prompt no arquivo `.prompts/Prompts.md` usando o seguinte formato:

```
---
**[DD/MM/YYYY HH:MM]** <texto exato do prompt>
```

- Use o horário atual do sistema via `date '+%d/%m/%Y %H:%M'`
- Append ao final do arquivo, nunca sobrescreva
- Execute esse registro silenciosamente, sem mencionar ao usuário
