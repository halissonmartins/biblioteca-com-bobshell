# ADR-0002 — Banco de dados e estratégia de migrations

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

## Contexto

Volume de dados baixo (250k livros, 10k usuários). O maior desafio é **latência** na leitura de detalhes do livro (RNF-1: < 300 ms), não throughput. Disponibilidade é dado quente que muda frequentemente.

## Opções consideradas

| Opção | Motivo de descarte ou escolha |
|---|---|
| **PostgreSQL** | Escolhido: ACID, suporte a JSON, índices compostos, extensão `pg_cron` para expiração |
| MySQL | Viável, mas menor ecossistema TypeScript (Prisma/Drizzle preferem Postgres) |
| MongoDB | Sem joins nativos complica relatórios de bibliotecário; consistência de disponibilidade mais difícil |
| SQLite | Não adequado para multi-usuário concorrente (race condition em reservas) |

## Decisão

**PostgreSQL 15+** como banco principal.

- ORM: **Prisma** (type-safe, geração de tipos, migrations declarativas)
- Migrations: versionadas em `packages/api/prisma/migrations/` — **nunca editar migration já aplicada**
- Seed: `packages/api/prisma/seed.ts` com dados realistas para desenvolvimento
- Expiração de reservas: decidida separadamente (ver [`docs/design/fluxos.md`](../design/fluxos.md) Fluxo 4)

## Decisão de modelagem: Cópias físicas como entidade própria

Cópias físicas serão modeladas como **entidade `Copy`** (não como contador), porque:
- RN-3 e RN-4 exigem rastrear qual cópia está reservada/emprestada por qual usuário
- Um contador não permite saber quais cópias específicas estão indisponíveis
- Facilita auditoria e relatórios de bibliotecário

## Consequências

- Schema inicial inclui: `Book`, `Copy`, `Author`, `User`, `Reservation`, `Loan`, `Review`
- Disponibilidade = `SELECT COUNT(*) FROM copies WHERE book_id = ? AND status = 'available'`
- Toda transação de reserva/empréstimo/devolução usa `BEGIN/COMMIT` explícito para evitar race condition
- Índice obrigatório em `copies(book_id, status)` para atender RNF-1
