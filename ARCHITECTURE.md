# ARCHITECTURE.md

> Responde "onde eu mexo para fazer X?" — não "como o módulo Y funciona por dentro".
> Atualizar quando surgir módulo novo, fronteira nova ou invariante novo. Não a cada feature.
> Referência canônica: https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html

---

## Visão geral

Sistema web híbrido de biblioteca: o Leitor reserva on-line, o Bibliotecário efetiva o empréstimo presencialmente. O sistema é o elo que garante que a Cópia reservada esteja separada quando o Leitor chegar, e que a reserva expire se ele não aparecer.

## Bird's eye view

O request do browser chega à SPA React (`packages/web`), que chama a API REST (`packages/api`). A API valida a identidade via JWT, aplica a regra de negócio na camada de domínio e persiste via Prisma no PostgreSQL. Tipos TypeScript são gerados do schema Prisma e compartilhados entre api e web via `packages/shared`.

O único estado compartilhado é o banco — não há cache distribuído, fila de mensagens nem serviço externo na v1.

## Code map

```
packages/
├── api/                        ← Processo único Node.js (API REST)
│   ├── src/
│   │   ├── domain/             ← Regras de negócio PURAS. Sem HTTP, sem banco.
│   │   │   ├── reservation/    ← Criação, validação, expiração de reservas
│   │   │   ├── loan/           ← Criação e encerramento de empréstimos
│   │   │   └── book/           ← Disponibilidade, detalhes de livro
│   │   ├── api/                ← Rotas HTTP e validação de entrada (Express)
│   │   │   ├── routes/         ← Definição de rotas por recurso
│   │   │   └── middleware/     ← Auth (JWT), autorização por papel, erros
│   │   ├── infra/              ← Acesso externo: banco, jobs de fundo, telemetria
│   │   │   ├── repositories/   ← ÚNICO ponto de acesso ao banco (via Prisma)
│   │   │   ├── jobs/           ← Job de expiração de reservas (se cron)
│   │   │   └── telemetry/      ← SDK OpenTelemetry, métricas e gauges de negócio
│   │   └── shared/             ← Erros tipados, logger, utilitários transversais
│   └── prisma/
│       ├── schema.prisma       ← Schema do banco (fonte de verdade do modelo)
│       ├── migrations/         ← Migrations imutáveis após aplicadas
│       └── seed.ts             ← Dados de desenvolvimento
│
├── web/                        ← SPA React 18 + TypeScript
│   └── src/
│       ├── pages/              ← Uma pasta por rota principal
│       ├── components/         ← Componentes reutilizáveis (seguem DESIGN.md)
│       ├── hooks/              ← React hooks de lógica de UI
│       ├── api/                ← Chamadas HTTP tipadas (geradas do OpenAPI)
│       └── utils/              ← Formatação e regras de produto aplicadas no cliente
│
└── shared/
    └── types/                  ← Tipos TypeScript compartilhados entre api e web
                                  (gerados do schema Prisma / OpenAPI)
```

## Invariantes arquiteturais

> **Estas são proibições. O agente não consegue inferir uma proibição a partir da ausência de exemplos — se não estiver escrito, ele viola.**

- `domain/` **NÃO importa** nada de `infra/`, `api/` nem de bibliotecas HTTP/banco — isso inclui `@opentelemetry/api` e o logger (ver ADR-0007)
- `api/routes/` **NÃO acessa** o banco diretamente — chama serviços de `domain/`
- `infra/repositories/` é o **ÚNICO** ponto de acesso ao banco em toda a aplicação
- `infra/` **NÃO contém** regra de negócio — apenas persistência e leitura
- `web/` **NÃO contém** regra de negócio — apenas apresentação e chamadas de API
- Tipos de domínio são definidos em `packages/shared/types/` — não duplicar em api ou web
- **Nenhuma migration já aplicada pode ser editada** — criar nova migration que a corrige

## Fronteiras entre camadas

```
Request HTTP
    ↓
api/middleware/  (autenticação JWT, autorização por papel)
    ↓
api/routes/      (validação de entrada — Zod)
    ↓
domain/          (regra de negócio, sem efeitos colaterais externos)
    ↓
infra/repositories/  (persistência via Prisma, transações explícitas)
    ↓
PostgreSQL
```

## Pontos de entrada

| Contexto | Arquivo por onde começar |
|---|---|
| Subir a API | `packages/api/src/index.ts` |
| Adicionar rota nova | `packages/api/src/api/routes/` + middleware em `middleware/auth.ts` |
| Mudar regra de negócio | `packages/api/src/domain/<domínio>/` |
| Mudar schema do banco | `packages/api/prisma/schema.prisma` → gerar migration → atualizar tipos |
| Adicionar tela nova | `packages/web/src/pages/` |
| Tipos compartilhados | `packages/shared/types/` |
| Adicionar métrica ou span | `packages/api/src/infra/telemetry/` → documentar em `docs/observabilidade.md` |
| Mexer na stack de observabilidade | `observabilidade/` + perfil `obs` do `docker-compose.yml` |

## Decisões arquiteturais

Cada decisão estruturante está em `docs/decisoes/`. Resumo dos ADRs ativos:

| ADR | Decisão |
|---|---|
| [0001](docs/decisoes/0001-linguagem-e-framework.md) | Node.js 20 + TypeScript (API) / React 18 + TypeScript (Web) |
| [0002](docs/decisoes/0002-banco-de-dados-e-migrations.md) | PostgreSQL 15 + Prisma; Cópias como entidade própria |
| [0003](docs/decisoes/0003-autenticacao-e-autorizacao.md) | JWT httpOnly; dois papéis: `leitor` e `bibliotecario` |
| [0004](docs/decisoes/0004-deploy-e-ambientes.md) | Docker + plataforma gerenciada; CI/CD via GitHub Actions |
| [0005](docs/decisoes/0005-monolito-modular.md) | Monolito modular com camadas explícitas; sem microserviços na v1 |
| [0006](docs/decisoes/0006-estrategia-de-testes.md) | Vitest (unit + integração) + Playwright (e2e); TDD por critério de aceite |
| [0007](docs/decisoes/0007-observabilidade.md) | OpenTelemetry + OTLP → Collector → Jaeger/Prometheus/Graylog, visualizado no Grafana |
