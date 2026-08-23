# `keycloak/` — realm versionado

`realm-biblioteca.json` é a **fonte de verdade** da identidade do projeto (ADR-0009).
Vale a mesma regra dos dashboards do Grafana e das capas: configuração é arquivo, não clique.

Mexer no admin console e não exportar **perde a mudança**: o estado mora no Postgres do
container `keycloak-db`, e o import só roda quando o realm ainda não existe.

## Como mudar o realm

| Caminho | Quando |
|---|---|
| Editar este JSON e reimportar (comando abaixo) | Mudança pequena e conhecida (uma flag, um papel) |
| Mexer no console → `make keycloak-export` → commitar o diff | Mudança que você precisa descobrir clicando (fluxo de autenticação, mapper) |

O import **só acontece com o realm ausente**. Para reimportar do zero:

```bash
docker compose rm -sfv keycloak keycloak-db
docker volume rm -f biblioteca-com-bobshell_biblioteca-keycloak-pgdata
make db-up   # gera os certs (se faltam) e espera tudo ficar healthy
```

## O que este realm tem, e por quê (Fase 2)

| Configuração | Valor | Motivo |
|---|---|---|
| `registrationAllowed` | `true` | Auto-cadastro é o entregável da Fase 1 |
| `verifyEmail` | `true` | Fase 2: e-mail confirmado via SMTP (`mailpit` no compose). Fecha o buraco do "qualquer e-mail". Efeito colateral nativo: o cadastro não pede senha — ela é definida ao confirmar o endereço, no link do e-mail |
| `resetPasswordAllowed` | `true` | Recuperação de senha — existe SMTP desde a Fase 2 |
| `passwordPolicy` | `length(12) and notUsername(undefined) and passwordHistory(3)` | Fase 2. `senha123` foi aposentada; a senha do seed é `Biblioteca#2026!` |
| `bruteForceProtected` | `true` (lockout temporário, nunca permanente em dev) | Fase 2: tentativas ilimitadas acabaram. O quick-login check fica **desligado** (`quickLoginCheckMilliSeconds: 0`): logins legítimos e concorrentes da suíte E2E (8 atores no teste da RN-3) não podem contar como brute force — o que protege de verdade é o `failureFactor` |
| `defaultLocale` | `pt-BR` | As telas de login/cadastro seguem o produto; os testes E2E afirmam sobre elas |
| `defaultRole` inclui `leitor` | — | Toda conta nova nasce Leitor. `bibliotecario` é atribuído à mão |
| `accessTokenLifespan` | `900` (15 min) | Mesma vida do token anterior; K6 conta com isso |
| `sslRequired` | `all` | Fase 2: token não trafega em claro nem em localhost |
| `loginTheme` | `biblioteca` | Tema Keycloakify gerado de `packages/theme`, seguindo DESIGN.md |
| mapper `audience-biblioteca-api` | nos dois clients | Sem ele o `aud` sai como `account` e a API rejeita **todo** token |

### Clients

| Client | Fluxo | Direct Access Grant | Quem usa |
|---|---|---|---|
| `biblioteca-web` | Authorization Code + PKCE (`S256` obrigatório) | **desligado** (Fase 2) | A SPA — token só via tela |
| `biblioteca-e2e` | só grant por senha | ligado | Playwright (`e2e/helpers.ts`) e K6 (`perf/lib/config.js`) |

> O `biblioteca-e2e` existe para teste e carga obterem token sem navegador. Está
> restrito a localhost e **não deve existir num realm de produção**
> ([docs/seguranca.md](../docs/seguranca.md)).

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

Senha `Biblioteca#2026!` para os três (política da Fase 2).

> Carlos recebe `bibliotecario` **e** `leitor` (este vem do papel padrão do realm).
> `roleFromRealmRoles()` resolve a favor de `bibliotecario` — é para isso que a precedência
> existe.

## Console e postura de segurança

Admin console em https://localhost:8443 com as credenciais `KC_BOOTSTRAP_ADMIN_*`
do `.env` da raiz — nada de `admin/admin` versionado aqui (Fase 2).

Para o navegador confiar no certificado local (`make certs`), importe
`keycloak/certs/ca.crt` na autoridade confiável do seu SO/navegador. Os testes E2E
dispensam isso (`ignoreHTTPSErrors`) e a API usa `NODE_EXTRA_CA_CERTS`.

## Tema de login

`loginTheme: biblioteca` é gerado pelo **Keycloakify** a partir de
[`packages/theme`](../packages/theme), seguindo [DESIGN.md](../DESIGN.md).
O JAR pronto fica versionado em `packages/theme/jar/biblioteca-login.jar` (montado
em `/opt/keycloak/providers` pelo compose); regenere com `make theme-build`.
