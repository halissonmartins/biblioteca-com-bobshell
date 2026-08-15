# Sistema de Biblioteca

Sistema web híbrido de catálogo, reservas e empréstimos de biblioteca.

## 📸 Telas

Fluxo híbrido do produto: o **Leitor** navega o catálogo e reserva on-line; o **Bibliotecário** acompanha e efetiva o empréstimo presencialmente.

### Catálogo de Livros (Leitor)

![Catálogo de Livros](assets/images/catalogo.png)

### Detalhes do Livro e Reserva (Leitor)

![Detalhes do Livro](assets/images/detalhe-livro.png)

### Painel do Bibliotecário — Reservas

![Reservas do Bibliotecário](assets/images/bibliotecario-reservas.png)

> Capturas geradas com Playwright a partir da UI real (`e2e/`).

## Rodar em 3 comandos

```bash
cp .env.example .env
make setup    # instala dependências e sobe o banco via docker compose
make dev      # inicia API (porta 3000) e Web (porta 5173) em modo watch
```

## Comandos disponíveis

```bash
make setup    # instala deps + docker compose up + prisma migrate + seed
make dev      # inicia API + Web em modo watch
make test     # roda testes unitários e de integração (Vitest)
make test-e2e # roda testes E2E (Playwright)
make lint     # ESLint + TypeScript typecheck
make build    # build de produção (api + web)
make migrate  # aplica migrations Prisma pendentes
make seed     # popula banco com dados de desenvolvimento
```

## Estrutura

```
packages/
├── api/          # API REST (Node.js 20 + Express + TypeScript)
├── web/          # SPA (React 18 + TypeScript)
└── shared/       # Tipos compartilhados gerados do schema
```

## Documentação

| Documento | O que responde |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Como escrever código neste projeto |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Onde ficam as coisas e quais fronteiras não se atravessa |
| [`docs/prd-sistema-biblioteca.md`](docs/prd-sistema-biblioteca.md) | O que construir e por quê |
| [`docs/produto/glossario.md`](docs/produto/glossario.md) | Linguagem ubíqua do domínio |
| [`docs/produto/user-stories.md`](docs/produto/user-stories.md) | Histórias com critério de aceite testável |
| [`docs/design/fluxos.md`](docs/design/fluxos.md) | Fluxos principais com estados de erro |
| [`docs/decisoes/`](docs/decisoes/) | ADRs das decisões estruturantes |
| [`docs/arquitetura/c4-contexto.md`](docs/arquitetura/c4-contexto.md) | Diagrama C4 do sistema |

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores. Nunca commite `.env`.

## Pré-requisitos

- Node.js 20+
- Docker + Docker Compose
- `make`
