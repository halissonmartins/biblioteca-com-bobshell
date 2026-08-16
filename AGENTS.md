# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Sobre o projeto

Sistema web híbrido de biblioteca: Leitor reserva on-line, Bibliotecário efetiva empréstimo presencialmente.
250k livros, 10k leitores ativos. Leia o PRD antes de implementar qualquer feature.

- PRD: [`docs/prd-sistema-biblioteca.md`](docs/prd-sistema-biblioteca.md)
- Glossário: [`docs/produto/glossario.md`](docs/produto/glossario.md) — use **exatamente** estes termos no código
- User stories: [`docs/produto/user-stories.md`](docs/produto/user-stories.md)
- Arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md) — leia antes de criar arquivo novo
- Observabilidade: [`docs/observabilidade.md`](docs/observabilidade.md) — logs, métricas, traces e dashboards. **Leia antes de adicionar métrica, span ou log.**
- Design system: [`DESIGN.md`](DESIGN.md) — tokens, componentes e regras do mundo visual. **Leia antes de gerar qualquer UI.** (`docs/design/design-system.md` descreve o mundo anterior e virou um redirecionamento)

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
make obs-up   # sobe a stack de observabilidade (perfil `obs`) — ver docs/observabilidade.md
```

**Rodar um único teste:**
```bash
npx vitest run packages/api/src/domain/reservation/reservation.test.ts
cd e2e && npx playwright test catalogo.spec.ts
```

**E2E (Playwright — dirige a UI real):**
```bash
docker compose up -d        # sobe o Postgres (raiz do repo)
cd e2e && npm install        # primeira vez
npm run install:browsers     # baixa o Chromium (primeira vez)
npm test                     # webServer sobe API+Web; globalSetup migra+popula
```

Onde cada cenário vai, quais Livros já estão reservados por outros testes e como
mexer no relógio dos dados: [`e2e/AGENTS.md`](e2e/AGENTS.md) — **leia antes de
escrever teste E2E**. A regra que mais se esquece: valor numérico de regra (12h de
RN-1, 7 dias de RN-8) se confere no JSON da resposta, nunca só no texto formatado
da tela.

**Comandos individuais (packages/api):**
```bash
cd packages/api
npm run typecheck          # TypeScript sem emitir (valida tipos)
npm run lint               # ESLint strict
npm run test               # Vitest (unit + integração)
npm run migrate:dev        # prisma migrate dev (cria migration + aplica)
npm run migrate:deploy     # prisma migrate deploy (só aplica — para CI/produção)
npm run db:generate        # prisma generate (regenera @prisma/client após schema change)
npm run db:seed            # popula banco com dados de dev (seed.ts)
npm run db:studio          # Prisma Studio em http://localhost:5555
```

**Fluxo para mudar o schema do banco:**
1. Editar `packages/api/prisma/schema.prisma`
2. `cd packages/api && npm run migrate:dev -- --name <nome_descritivo>`
3. Commitar o arquivo SQL gerado em `prisma/migrations/`
4. **Nunca editar** migration já aplicada

## Regras de negócio críticas (não violar — derivadas do PRD)

- Reserva expira automaticamente após **12 horas** (RN-1)
- Empréstimo só pode ser efetivado por **`bibliotecario`**, nunca pelo `leitor` (RN-2, RN-7)
- Reserva só pode ser criada se houver **Cópia com `status = 'available'`** (RN-3)
- Cópia reservada fica **`status = 'reserved'`** — bloqueada para outros leitores (RN-4)
- Apenas reservas ativas (não expiradas) podem ser convertidas em Empréstimo (RN-6)
- Empréstimo vence em **7 dias corridos**, ajustável pelo Bibliotecário no balcão (RN-8) — o padrão vive em `LOAN_PERIOD_DAYS` (`packages/web/src/utils/loan.ts`); a API ainda aceita qualquer `dueAt`
- Toda transação de reserva/empréstimo/devolução usa `BEGIN/COMMIT` explícito (race condition)

## Convenções obrigatórias

- **`any` explícito é proibido** — TypeScript strict em toda a base de código
- **Toda rota nova** declara o papel permitido e tem **teste de autorização** (papel errado → 403)
- **Nunca editar migration já aplicada** — criar nova migration que corrige
- **Nunca desabilitar lint/tipo/teste** para fazer build ou CI passar
- **Toda mudança de schema** exige migration versionada em `packages/api/prisma/migrations/`
- Commits seguem **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- Toda variável de ambiente nova vai para `.env.example` no mesmo PR
- **`domain/` não emite telemetria** — nem `@opentelemetry/api`, nem logger. Métricas ficam em `api/` e `infra/` (ADR-0007)
- **Id de entidade nunca é atributo de métrica** — só de span (cardinalidade)
- **Métrica nova é declarada em `infra/telemetry/metrics.ts`** e documentada em `docs/observabilidade.md`
- **Dashboard novo é JSON versionado** em `observabilidade/grafana/dashboards/<uid>.json` (`uid` = nome do arquivo), registrado em `e2e/dashboards.spec.ts` e documentado nas duas seções de `docs/observabilidade.md` (§6 descritiva e §9 com o screenshot). Dashboard vindo do marketplace grava a procedência e as adaptações no campo `description` do JSON

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
