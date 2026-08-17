# ADR-0003 — Autenticação e autorização

| Campo | Valor |
|---|---|
| Status | **Substituído** pelo [ADR-0009](0009-identidade-com-keycloak.md) |
| Data | 14/08/2026 |
| Substituído em | 16/08/2026 |

> **Este ADR não descreve mais o sistema.** O JWT próprio, o `bcrypt` e a tabela
> `refresh_tokens` foram removidos: quem autentica é o Keycloak, e a API só
> valida token contra o JWKS do realm — ver
> [ADR-0009](0009-identidade-com-keycloak.md) e
> [`docs/seguranca.md`](../seguranca.md).
>
> O texto abaixo fica como registro do que foi decidido e por quê. **O que
> sobreviveu à troca** é o modelo de autorização: dois papéis (`leitor`,
> `bibliotecario`), middleware conferindo papel antes de cada rota protegida, e
> teste de autorização como item obrigatório da definition of done.

## Contexto

Dois papéis distintos: `leitor` e `bibliotecario`. Ações de balcão são exclusivas do bibliotecário (RN-7). A separação deve ser verificável por teste automatizado.

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **JWT stateless** | Simples, sem estado no servidor, adequado ao volume | Token revogação requer lista negra se necessário |
| Session + cookie httpOnly | Mais seguro contra XSS | Requer session store (Redis/banco) |
| OAuth externo (Google, etc.) | Sem gerenciar senhas | Dependência externa; excesso de complexidade para v1 |

## Decisão

**JWT com refresh token**, armazenados em cookies `httpOnly; Secure; SameSite=Strict`.

- Access token: 15 min de vida
- Refresh token: 7 dias, rotacionado a cada uso
- Payload do JWT inclui `userId` e `role` (`leitor` | `bibliotecario`)
- Middleware de autorização verifica `role` antes de cada rota protegida

## Modelo de autorização

```
Rota pública:       GET /books, GET /books/:id, GET /authors/:id
Rota de Leitor:     POST /reservations, GET /me/reservations, GET /me/loans
Rota de Bibliotecário: POST /loans, PATCH /loans/:id/return,
                       GET /reservations, GET /loans (com filtro por usuário)
```

## Consequências

- **Toda rota nova** deve declarar explicitamente qual papel tem acesso — sem rota sem middleware de auth
- **Teste de autorização** é item obrigatório da definition of done (leitor tentando rota de bibliotecário deve receber 403)
- Senha armazenada com **bcrypt** (custo ≥ 12)
- Sem autenticação de dois fatores na v1
