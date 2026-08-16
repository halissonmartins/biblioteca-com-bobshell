# ADR-0004 — Estratégia de deploy e ambientes

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

## Contexto

Time pequeno, projeto greenfield. Prioridade: chegar a produção cedo (E3 — walking skeleton). Sem requisito de alta disponibilidade na v1.

## Decisão

**Deploy em contêiner único via Docker + Railway (ou Render) como plataforma gerenciada.**

### Ambientes

| Ambiente | Trigger | Banco |
|---|---|---|
| **local** | `docker compose up` | PostgreSQL local via docker-compose |
| **staging** | Push para `main` | PostgreSQL gerenciado (Railway/Render, instância pequena) |
| **production** | Tag `v*` na `main` | PostgreSQL gerenciado (instância de produção) |

### Pipeline CI/CD

```
PR aberto  →  CI: lint + typecheck + testes + build
PR merged na main  →  Deploy automático em staging
Tag v*.*.*  →  Deploy em production
```

- CI roda em **GitHub Actions**
- Build: `docker build` com multi-stage (deps → build → runtime)
- Deploy: rollback via re-deploy da imagem anterior na plataforma

### Ativos estáticos

As capas de Livro são servidas em `/capas/…` — localmente pelo nginx do `docker-compose.yml`, em staging e produção **pela mesma origem da SPA** (ou por um CDN à frente dela). É por isso que `coverUrl` guarda caminho relativo: nenhum ambiente precisa de variável nova. Ver [ADR-0008](0008-imagens-de-capa.md), inclusive o motivo de o edge precisar falar HTTP/2.

### Variáveis de ambiente

Gerenciadas pela plataforma de deploy (não em arquivos `.env` no repositório).
`.env.example` documenta todas as variáveis necessárias sem valores reais.

## Consequências

- `docker-compose.yml` é a única forma de rodar o projeto localmente (não instalar Postgres diretamente)
- `Makefile` expõe os comandos padronizados: `make setup`, `make dev`, `make test`, `make lint`, `make build`
- Toda variável de ambiente nova deve ser adicionada ao `.env.example` no mesmo PR
