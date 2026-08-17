# `keycloak/` — realm versionado

`realm-biblioteca.json` é a **fonte de verdade** da identidade do projeto (ADR-0009).
Vale a mesma regra dos dashboards do Grafana: configuração é arquivo, não clique de UI.

Mexer no admin console e não exportar **perde a mudança** no próximo
`docker compose down -v` — o `start-dev` guarda em H2 dentro do volume, e o import só
roda quando o realm ainda não existe.

## Como mudar o realm

| Caminho | Quando |
|---|---|
| Editar este JSON e `docker compose up -d --force-recreate keycloak` | Mudança pequena e conhecida (uma flag, um papel) |
| Mexer no console → `make keycloak-export` → commitar o diff | Mudança que você precisa descobrir clicando (fluxo de autenticação, mapper) |

O import **só acontece com o realm ausente**. Para reimportar do zero:

```bash
docker compose rm -sfv keycloak && docker volume rm -f biblioteca-com-bobshell_biblioteca-keycloak-data
docker compose up -d --wait keycloak
```

## O que este realm tem, e por quê

| Configuração | Valor | Motivo |
|---|---|---|
| `registrationAllowed` | `true` | Auto-cadastro é o entregável da Fase 1 |
| `verifyEmail` | `false` | "Qualquer e-mail, sem verificação" — não há SMTP nesta fase |
| `resetPasswordAllowed` | `false` | Recuperar senha exige SMTP; Fase 2 |
| `defaultLocale` | `pt-BR` | As telas de login/cadastro são as do Keycloak; os testes E2E afirmam sobre o texto delas |
| `defaultRole` inclui `leitor` | — | Toda conta nova nasce Leitor. `bibliotecario` é atribuído à mão |
| `accessTokenLifespan` | `900` (15 min) | Mesma vida do token anterior; K6 conta com isso |
| mapper `audience-biblioteca-api` | — | Sem ele o `aud` sai como `account` e a API rejeita **todo** token |
| `directAccessGrantsEnabled` | `true` | É como Playwright e K6 pegam token sem navegador. Desligar é Fase 2 |

## IDs fixos dos usuários do seed

Os três usuários têm `id` UUID **literal**. `packages/api/prisma/seed.ts` grava esses mesmos
valores em `users.externalId`, e é isso que mantém as Reservas e os Empréstimos do seed
pertencendo à Ana Lima — metade da suíte E2E depende disso.

**Os dois arquivos se editam juntos.** Ver `KEYCLOAK_USER_IDS` no `seed.ts`.

| E-mail | `id` no realm | Papel |
|---|---|---|
| `leitor@biblioteca.dev` (Ana Lima) | `b1b11071-0000-4000-8000-000000000001` | `leitor` |
| `leitor2@biblioteca.dev` (Bruno Costa) | `b1b11071-0000-4000-8000-000000000002` | `leitor` |
| `bibliotecario@biblioteca.dev` (Carlos Mendes) | `b1b11071-0000-4000-8000-000000000003` | `bibliotecario` |

Senha `senha123` para os três.

> Carlos recebe `bibliotecario` **e** `leitor` (este vem do papel padrão do realm).
> `roleFromRealmRoles()` resolve a favor de `bibliotecario` — é para isso que a precedência
> existe.

## Console e postura de segurança

Admin console em http://localhost:8081 com `admin` / `admin` — credencial local, e um dos
itens que a Fase 2 fecha. A lista completa do que esta fase deixa deliberadamente frouxo está
em [`docs/seguranca.md`](../docs/seguranca.md).
