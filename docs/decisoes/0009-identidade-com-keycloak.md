# ADR-0009 — Identidade com Keycloak

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 16/08/2026 |
| Substitui | [ADR-0003 — Autenticação e autorização](0003-autenticacao-e-autorizacao.md) |

## Contexto

O [ADR-0003](0003-autenticacao-e-autorizacao.md) resolveu a v1 com JWT próprio:
`bcrypt` contra `users.passwordHash`, HS256 assinado com `JWT_SECRET`, refresh
tokens rotacionados numa tabela nossa. A própria tabela de opções de lá já
registrava "OAuth externo" como descartado por complexidade — decisão correta
para o escopo daquele momento.

Três coisas mudaram esse cálculo:

1. **Não existe caminho para novos Leitores.** Só os 3 usuários do seed entram.
   O PRD prevê 10.000 Leitores ativos; cadastrar cada um por migration não é
   plano.
2. **O segredo de assinatura é simétrico.** Quem valida token também pode forjá-lo,
   e ele vive num `.env`. Toda máquina que roda a API pode emitir credencial de
   Bibliotecário.
3. **Não há revogação.** Conta comprometida continua valendo até o token vencer.

Além disso, MFA, SSO institucional e auditoria de login aparecem na conversa de
produto, e cada um deles é um projeto se for construído em casa.

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Manter o JWT caseiro e evoluir** | zero infra nova; controle total | reimplementar cadastro, verificação, MFA, revogação e auditoria — é escrever um IdP sem querer |
| **Keycloak auto-hospedado** | OIDC completo pronto; realm versionável; sem custo por usuário; roda no compose junto do resto | +1 container (~700 MB de RAM); realm é mais uma configuração a manter |
| **IdP como serviço** (Auth0, Cognito) | nada para operar | custo por usuário ativo; dependência externa em dev e em CI; conflita com "nada sai da rede em runtime", já assumido no [ADR-0008](0008-imagens-de-capa.md) |

## Decisão

**Keycloak auto-hospedado**, com a API atuando **exclusivamente como resource
server**.

- Fluxo da SPA: **Authorization Code + PKCE (S256)** — a senha nunca passa pela
  nossa origem
- A API valida token contra o **JWKS** do realm (`jose`); só a chave pública
  entra aqui. **`JWT_SECRET` deixou de existir**
- Realm versionado em `keycloak/realm-biblioteca.json`, importado no boot — mesma
  regra dos dashboards do Grafana: configuração é arquivo, não clique de UI
- Papéis continuam sendo `leitor` e `bibliotecario`, agora como realm roles.
  `requireRole()` não mudou
- `users` vira o **espelho local** da identidade, ligado por `users.externalId`
  (o `sub` do token) e preenchido por **JIT provisioning** no primeiro acesso
- Versão **pinada** (`26.7.1`): Keycloak não tem LTS — só a linha mais recente
  recebe correção de segurança

### Fase 1 (esta)

Auto-cadastro com **qualquer e-mail e sem verificação**, papel padrão `leitor`.
`bibliotecario` é atribuído à mão no console.

## O que foi rejeitado dentro da decisão

- **Trocar a PK de `users` pelo `sub` do Keycloak.** Seria migration destrutiva
  sobre quatro FKs. O `externalId` custa um lookup por índice único por
  requisição e mantém rotas e `domain/` sem saber que existe um Keycloak.
- **Mover RN-2/RN-6/RN-7 para policies do Keycloak.** São regra de negócio, não
  permissão de plataforma: ficam em `domain/`, testáveis sem subir nada.
- **Ler o papel do token na SPA.** A interface pega papel e id do `GET /me`, uma
  fonte só — a tela não pode discordar da API sobre quem é Bibliotecário.

## Consequências

**Ganhos**

- Não guardamos senha. `users.passwordHash` e a tabela `refresh_tokens` foram
  removidas por migration
- Assinatura assimétrica: comprometer a API não permite forjar token
- Auto-cadastro, revogação central e eventos de login auditáveis, sem código nosso
- Caminho pronto para MFA, SSO e login social (Fases 3 e 4)

**Custos**

- **O Keycloak vira dependência dura de desenvolvimento e de CI**: sem ele,
  ninguém autentica. Sobe no `docker compose up -d`, fora de qualquer profile, e
  acrescenta ~40 s ao job de E2E
- ~700 MB de RAM a mais — relevante no orçamento de 6 GB do WSL2, sobretudo com
  o profile `obs` no ar
- **A tela de login sai do nosso design system** e passa a ser o tema padrão do
  Keycloak. Registrado no [`DESIGN.md`](../../DESIGN.md); tema próprio é Fase 2
- `biblioteca.logins` deixou de ser emitida pela API — a origem passou a ser o
  Keycloak, e o dashboard foi repontado
- Mais um artefato de configuração para manter em sincronia: os UUIDs dos
  usuários do realm e o `externalId` do `seed.ts` se editam juntos

**Invariante novo**

> A API **nunca** emite nem renova token. Quem faz isso é o Keycloak.
> Não existe rota `/auth` nesta aplicação.

## Postura de segurança e próximas fases

O que a Fase 1 deixa deliberadamente aberto — auto-cadastro sem verificação, H2,
`admin`/`admin`, HTTP sem TLS, Direct Access Grant ligado — está registrado item
a item, com o "por que é aceitável agora", em
[`docs/seguranca.md`](../seguranca.md), junto do plano das Fases 2 a 4.
