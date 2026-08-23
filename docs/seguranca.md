# Segurança — identidade com Keycloak

> Como a identidade funciona neste sistema, o que a Fase 1 deliberadamente
> **não** protege, e o que vem depois.
> Decisão estruturante: [ADR-0009](decisoes/0009-identidade-com-keycloak.md).
> Configuração do realm: [`keycloak/README.md`](../keycloak/README.md).

---

## 1. O que mudou, e por quê

Até a v1 a identidade era caseira ([ADR-0003](decisoes/0003-autenticacao-e-autorizacao.md)):
`bcrypt.compare` contra `users.passwordHash`, JWT HS256 assinado com `JWT_SECRET`
do `.env`, refresh tokens rotacionados à mão numa tabela nossa. Funcionava, e
carregava quatro problemas que não se resolvem escrevendo mais código nosso:

| Problema | Antes | Agora |
|---|---|---|
| Guarda de credencial | hash de senha no nosso Postgres | não temos senha nenhuma |
| Segredo de assinatura | `JWT_SECRET` no `.env`, simétrico — quem valida também forja | RS256; só a **chave pública** entra na API, por JWKS |
| Revogação | inexistente — token valia até vencer | sessão encerrável no Keycloak |
| Entrada de novos Leitores | só os 3 usuários do seed | auto-cadastro |

A API deixou de ser _authorization server_ e passou a ser **apenas resource
server**: ela verifica tokens e nunca os emite.

**O que NÃO mudou, de propósito:** RN-2, RN-6 e RN-7 continuam em `domain/`.
Regra de negócio é nossa; autenticação é do Keycloak. A prova é que
`e2e/autorizacao-api.spec.ts` passou a troca inteira de provedor de identidade
**sem alterar um único teste de 403**.

---

## 2. Como um pedido autenticado atravessa o sistema

```
Navegador                 Keycloak (:8443, https)       API (:3000)          Postgres
    │                          │                            │                   │
    │ 1. GET /minhas-reservas  │                            │                   │
    │    (sem sessão)          │                            │                   │
    │─── 302 ─────────────────>│                            │                   │
    │    Authorization Code + PKCE (S256)                   │                   │
    │                          │                            │                   │
    │ 2. e-mail + senha ──────>│  a senha NUNCA passa por nós                   │
    │<── 302 ?code=… ──────────│                            │                   │
    │                          │                            │                   │
    │ 3. code + code_verifier ─>│                           │                   │
    │<── access_token (RS256) ─│                            │                   │
    │                          │                            │                   │
    │ 4. Authorization: Bearer <token> ───────────────────->│                   │
    │                          │<── JWKS (1ª vez, cacheado) │                   │
    │                          │                            │ 5. verifica       │
    │                          │                            │    assinatura     │
    │                          │                            │    iss, aud, exp  │
    │                          │                            │                   │
    │                          │                            │ 6. externalId ───>│
    │                          │                            │<── users.id ──────│
    │<── 200 ───────────────────────────────────────────────│                   │
```

**Passo 5** — `packages/api/src/infra/keycloak/tokenVerifier.ts`. Quatro
conferências, e as duas últimas são as que assinatura sozinha não cobre:

- **assinatura** RS256 contra o JWKS do realm (`jose` cacheia e rebusca sozinho na rotação de chave)
- **`exp`** — token vencido é recusado
- **`iss`** — precisa ser o nosso realm. Um token legítimo de *outro* realm também é um JWT bem assinado
- **`aud`** — precisa conter `biblioteca-api`. Um token emitido para outro serviço não vale aqui

**Passo 6** é o ponto de costura, e merece explicação própria.

---

## 3. O espelho local (`externalId`) e o JIT provisioning

O `sub` do Keycloak é um UUID do realm. `reservations.userId` e `loans.userId`
apontam para `users.id`, um cuid nosso. As duas coisas precisam se encontrar.

A escolha foi **não** trocar a PK de `users` — seria uma migration destrutiva
sobre quatro chaves estrangeiras. Em vez disso, `users.externalId` guarda o `sub`,
e o middleware resolve `externalId → users.id` a cada pedido, entregando o **id
local** em `req.user.sub`. Consequência: nenhuma rota e nenhum serviço de
`domain/` sabe que existe um Keycloak.

`resolveLocalUser()` (`domain/auth/authService.ts`) faz o **JIT provisioning**:

1. procura `users` por `externalId`
2. não achou → **cria** a linha ali mesmo, com nome, e-mail e papel do token
3. achou, mas o realm diverge → ressincroniza (só quando diverge, senão seria um
   `UPDATE` por requisição)

É isso que permite alguém se cadastrar só no Keycloak e já conseguir reservar: a
linha em `users` nasce no primeiro acesso autenticado, não num cadastro nosso.

> **Sem cache, de propósito.** É um lookup por índice único por requisição
> autenticada. As rotas autenticadas têm orçamento de 3 s (a de 300 ms é pública
> e nem passa por aqui). Se `make perf` acusar regressão, aí se discute cache.

### O papel

Vem de `realm_access.roles` do token, traduzido por `roleFromRealmRoles()`:

- o realm entrega lixo junto (`default-roles-biblioteca`, `offline_access`,
  `uma_authorization`) — é ignorado
- **`bibliotecario` vence `leitor`**: quem administra o balcão costuma acumular
  os dois, e o papel de menor alcance não pode rebaixar o de maior
- nenhum dos dois → **403**, não 401. A pessoa se autenticou; só não tem o que
  fazer nesta biblioteca

O papel **nunca** vem do corpo da requisição, nem de coluna consultada por
conveniência. `requireRole()` não mudou uma linha — nem a assinatura, nem os testes.

---

## 4. O realm

Detalhe campo a campo em [`keycloak/README.md`](../keycloak/README.md). O que
importa para segurança:

| Configuração | Valor | Efeito |
|---|---|---|
| `registrationAllowed` | `true` | qualquer pessoa cria conta |
| `verifyEmail` | `true` | e-mail confirmado via SMTP (`mailpit` do compose) — Fase 2 fechou o buraco |
| `resetPasswordAllowed` | `true` | recuperação de senha pelo link recebido por e-mail — Fase 2 |
| `passwordPolicy` | 12+ caracteres, `notUsername`, histórico de 3 | `senha123` não passa mais; senha do seed: `Biblioteca#2026!` |
| `bruteForceProtected` | `true`, lockout temporário | tentativas ilimitadas acabaram (Fase 2) |
| papel padrão | `leitor` | conta nova nunca nasce Bibliotecária |
| `accessTokenLifespan` | 900 s | janela de 15 min para token vazado |
| PKCE | `S256` obrigatório | código interceptado não vira token |
| `sslRequired` | `all` | nada em http — nem em localhost (Fase 2) |
| Direct Access Grant | **desligado no `biblioteca-web`**; client `biblioteca-e2e` restrito a localhost para Playwright/K6 | Fase 2 |

### Criar um Bibliotecário

Não há tela para isso, e é intencional — atribuir o papel que efetiva Empréstimo
é ato administrativo:

1. https://localhost:8443 → realm `biblioteca` → **Users** (login com as credenciais
   `KC_BOOTSTRAP_ADMIN_*` do `.env`)
2. selecionar a pessoa → **Role mapping** → **Assign role** → `bibliotecario`
3. ela precisa sair e entrar de novo (o papel viaja no token)

O espelho local se ressincroniza sozinho no primeiro pedido depois disso.

---

## 5. O que a Fase 1 deixou frouxo — e a Fase 2 fechou

A tabela abaixo era a postura declarada da Fase 1 ("este realm não vai para produção
como está"). Cada linha virou trabalho da Fase 2:

| O que era aceitável na Fase 1 | Como a Fase 2 fechou |
|---|---|
| Auto-cadastro sem verificar e-mail | `verifyEmail: true` + SMTP (`mailpit`); conta só é utilizável após confirmar o endereço — que é também quando a **senha é definida** (o cadastro nem pede senha: ninguém registra e-mail alheio com credencial própria). O auto-cadastro continua sendo requisito de produto |
| Sem SMTP | Container `mailpit` no compose (nada sai para a rede); UI/API em :8025 |
| `admin`/`admin` no console | Credenciais de bootstrap vêm de `KC_BOOTSTRAP_ADMIN_*` no `.env` da raiz, interpoladas pelo compose |
| HTTP sem TLS (`sslRequired: none`) | `sslRequired: all`; Keycloak em https://localhost:8443 com CA local gerada por `make certs` (scripts/gerar-certificados.sh); cookies `Secure` de graça |
| `start-dev` + H2 | Modo `start` (produção) com **Postgres dedicado** (`keycloak-db`) — backup e ciclo de vida independentes do banco do produto |
| Direct Access Grant ligado no client da SPA | Desligado no `biblioteca-web`; Playwright e K6 usam o client `biblioteca-e2e`, restrito a localhost e **inexistente num realm de produção** |
| Sem política de senha nem brute force | `passwordPolicy length(12)+notUsername+history(3)`; `bruteForceProtected` com lockout temporário (nunca permanente em dev) |
| Tela de login fora do mundo visual | Tema `biblioteca` via Keycloakify (`packages/theme`), seguindo DESIGN.md |

**O que continua deliberadamente frouxo** — agora como decisão de ambiente, não de realm:
credenciais locais do Postgres (`biblioteca/biblioteca`), do Grafana e do Graylog;
`registrationAllowed: true` é requisito de produto, não fraqueza.

---

## 6. O que o log e as métricas mostram

**Log:** a lista de campos redigidos em
[`observabilidade.md`](observabilidade.md) perdeu `passwordHash` (a coluna não
existe mais) e ganhou `code_verifier` e `id_token`.

`code` ficou **fora** da lista de propósito: é o nome do campo de `AppError`, e
censurá-lo apagaria o código de todo erro de negócio do log. O code de
autorização do PKCE não passa por nós — vai do navegador direto ao token
endpoint do Keycloak.

**Métricas:** `biblioteca.logins` deixou de existir — a API não vê mais login
acontecer. A origem passou a ser o próprio Keycloak, que expõe Prometheus nativo
na porta de management:

| Métrica | Origem | O que mostra |
|---|---|---|
| `keycloak_user_events_total{event="login",error=""}` | Keycloak :9000 | logins bem-sucedidos |
| `keycloak_user_events_total{event="login",error!=""}` | Keycloak :9000 | falhas, com o motivo (`invalid_user_credentials`) |
| `keycloak_user_events_total{event="register"}` | Keycloak :9000 | auto-cadastros — a capacidade nova da Fase 1 |
| `biblioteca.autenticacao.falhas` | API | token recusado por **nós**: `sem_token`, `expirado`, `invalido` |
| `biblioteca.autorizacao.negacoes` | API | 403 por papel (RN-2 / RN-7) |

As duas últimas continuam valendo e são justamente o que o Keycloak **não** vê:
token forjado, expirado ou de outro realm nunca chega até ele.

O painel *Autenticação* do dashboard `biblioteca-saude-api` cruza as duas fontes.
Ver [`observabilidade.md`](observabilidade.md).

---

## 7. Fora de escopo agora — as próximas fases

Tudo aqui é conhecido e adiado, não esquecido.

### Fase 2 — fechar o que a Fase 1 abriu ✅

Implementada: modo `start` com Postgres dedicado, TLS com CA local, segredo de
bootstrap no `.env`, Direct Access Grant isolado no `biblioteca-e2e`, política de
senha + brute force, SMTP com verificação de e-mail e tema Keycloakify. Detalhes
por item na §5. O que restou da lista original e segue adiante:

- MFA/OTP — promovido para a Fase 3, onde já estava
- Rate limiting no gateway à frente do `/token` — Fase 4

### Fase 3 — capacidades de identidade

- **MFA/OTP obrigatório para `bibliotecario`** — é o papel cuja ação move acervo
  físico; é ele que merece o segundo fator antes do Leitor
- **Step-up authentication** por ACR na efetivação de Empréstimo
- **SSO institucional** (SAML ou OIDC brokering) para o quadro de funcionários
- **Login social** (Google) para o Leitor
- Sessões: limite de simultâneas, revogação pelo admin, "sair de todos os dispositivos"

### Fase 4 — autorização fina e conformidade

- Migrar de realm roles para **groups + composite roles** (ex.: `bibliotecario-chefe`
  podendo estender prazo além dos 7 dias de RN-8)
- **Keycloak Authorization Services** (UMA) se aparecer permissão por recurso —
  acervo por unidade, por exemplo
- **Auditoria**: exportar os eventos do Keycloak para o Graylog, com retenção
- **LGPD**: exclusão de conta propagada do Keycloak para a nossa base, e
  portabilidade dos dados do Leitor
- Rotação automática das chaves do realm, com alerta de expiração
- Rate limiting no gateway à frente do `/token`

### Explicitamente fora, sem fase prevista

- **Substituir a autorização do domínio por policies do Keycloak.** RN-2, RN-6 e
  RN-7 são regra de negócio, não permissão de plataforma. Ficam em `domain/`,
  testáveis sem subir nada
- **Keycloak como fonte de verdade dos dados do Leitor** (endereço, histórico) —
  o nosso banco continua dono; o realm só responde por identidade
- Alta disponibilidade / multi-cluster do Keycloak
- Migrar Grafana e Graylog para autenticar no Keycloak — possível, não pedido

---

## 8. Operação

```bash
make certs                            # primeira vez: CA local + certificado https
docker compose up -d --wait          # sobe Postgres, keycloak-db, Mailpit, capas e Keycloak
make keycloak-export                 # persiste no repo o que foi mudado no console
```

O admin console pede as credenciais `KC_BOOTSTRAP_ADMIN_*` do `.env` da raiz —
troque `KC_BOOTSTRAP_ADMIN_PASSWORD` antes da **primeira** subida; o bootstrap só
cria o admin uma vez. Para o navegador confiar em https://localhost:8443, importe
`keycloak/certs/ca.crt`.

**Migrando de uma Fase 1:** `make env` preserva os `.env` que já existem, então
as cópias antigas de `packages/api/.env` e `packages/web/.env` continuariam
apontando para a porta 8081 (e o Vite lê as `VITE_*` na subida). Regenere:

```bash
rm packages/api/.env packages/web/.env && make env
```

| Endereço | O que é |
|---|---|
| https://localhost:8443 | Admin console (credenciais do `.env`) e telas de login/cadastro |
| http://localhost:8025 | Mailpit — a caixa de entrada de dev (verificação de conta, reset de senha) |
| https://localhost:8443/realms/biblioteca/.well-known/openid-configuration | Discovery — o primeiro lugar a olhar quando "dá 401" |
| http://localhost:9002/metrics | Métricas do Keycloak (o Prometheus raspa por dentro da rede) |
| http://localhost:9002/health/ready | Healthcheck do compose |

**Diagnóstico de "tudo dá 401":** confira, nesta ordem, se o container está
`healthy`, se o discovery responde (`curl -k` por causa do certificado local), se
`KEYCLOAK_ISSUER_URL` bate **exatamente** com o `issuer` do discovery — ele tem de
ser `https://localhost:8443/...`, igual ao `KC_HOSTNAME` do compose (esquema,
porta e barra final contam) — e se `KEYCLOAK_AUDIENCE` bate com o mapper
`audience-biblioteca-api` do realm. Divergência em qualquer um dos dois derruba
**todo** token, não alguns.

```bash
# Token e claims, sem navegador — o caminho mais curto para ver o que a API vê.
# Desde a Fase 2 o grant por senha é do client biblioteca-e2e; o biblioteca-web
# recusa com unauthorized_client. -k porque o certificado é da CA local.
curl -sk -d 'grant_type=password&client_id=biblioteca-e2e' \
     -d 'username=leitor@biblioteca.dev&password=Biblioteca#2026!' \
     https://localhost:8443/realms/biblioteca/protocol/openid-connect/token
```

---

## 9. Onde isso está no código

| Arquivo | Responsabilidade |
|---|---|
| `keycloak/realm-biblioteca.json` | O realm — fonte de verdade da configuração |
| `packages/api/src/infra/keycloak/tokenVerifier.ts` | Assinatura, `iss`, `aud`, `exp` |
| `packages/api/src/domain/auth/authService.ts` | Papel e JIT provisioning — **puro**, sem HTTP nem banco |
| `packages/api/src/api/middleware/auth.ts` | Costura as duas peças; `requireRole` |
| `packages/api/src/api/routes/me.ts` | `GET /me` — o perfil local |
| `packages/api/src/test/keycloak.ts` | Kit de teste: emite RS256 de verdade, sem rede |
| `packages/web/src/hooks/useAuth.tsx` | Adapta o OIDC ao contexto que o app já usava |
| `e2e/helpers.ts` | `loginUI`, `registrarUI`, `definirSenhaInicial`, `registrarEEntrar`, `linkDeAcaoDoEmail` |
| `packages/theme/` | Tema de login (Keycloakify) — o JAR versionado em `jar/` é montado no compose |
| `scripts/gerar-certificados.sh` | CA local + certificado do https do Keycloak (`make certs`) |
