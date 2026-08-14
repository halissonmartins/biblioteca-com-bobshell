# ADR-0003 — Autenticação e autorização

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

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
