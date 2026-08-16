# Testes de performance (K6)

Suíte de carga que valida os requisitos de latência do PRD (RNF-1..4) e o ganho
do índice trigram (`pg_trgm`) na busca do catálogo, em escala realista (~250k livros).

Os scripts são JavaScript **standalone do K6** — não há `package.json` nem
`node_modules` aqui. Requer o binário [`k6`](https://k6.io) no PATH (`k6 version`).

## Requisitos de latência validados

| RNF | Endpoint | Métrica K6 | Alvo (p95) |
|---|---|---|---|
| RNF-1 | `GET /books/:id` | `book_detail` | < 300 ms |
| RNF-2 | `POST /reservations` | `reservation` | < 3 s |
| RNF-3 | `POST /loans` + `PATCH /loans/:id/return` | `loan`, `return` | < 3 s |
| RNF-4 | `GET /me/reservations`, `GET /me/loans` | `my_lists` | < 500 ms |
| — | `GET /books?search=` | `catalog_search` | < 400 ms (meta interna) |

Cada cenário também impõe `http_req_failed < 1%` e `checks > 99%`.

As capas de Livro **não entram nestes números**: elas não passam pela API (são
servidas em `/capas/…` pelo nginx do compose — ADR-0008) e o acervo de 250k do
`seed-perf.ts` não tem capa nenhuma. Os alvos aqui são de endpoint; peso de
página com imagem é outra medida, ainda não coberta.

### Resultados atuais (250k livros, WSL2 6 GB)

| Métrica | p95 medido | Alvo | Status |
|---|---|---|---|
| `book_detail` | ~35 ms | < 300 ms | ✅ |
| `reservation` | ~23 ms | < 3 s | ✅ |
| `loan` / `return` | ~25 ms | < 3 s | ✅ |
| `my_lists` | ~350 ms | < 500 ms | ✅ (¹) |
| `catalog_search` | **~360 ms** | < 400 ms | ✅ (²) |

¹ `my_lists` cresce conforme o histórico de empréstimos do leitor se acumula entre
execuções; rode `make perf-seed -- --reset` para uma medição limpa.

² A busca do catálogo era ~5,6 s antes da otimização em `bookRepository.findBooks`
(ver "Diagnóstico" abaixo). Sob concorrência alta (`SEARCH_VUS=10`) ainda sobe para
~700 ms — o `count(*)` exato do total continua sendo o custo dominante.

## Pré-requisitos

1. **API no ar** em `http://localhost:3000` (`make dev` ou `make dev-api`).
2. **Seed de performance** aplicado — popula ~250k livros / ~500k cópias:

   ```bash
   make perf-seed          # cd packages/api && npm run db:seed:perf
   ```

   > O índice trigram só tem efeito mensurável nessa escala. Rodar contra o seed
   > de desenvolvimento (10 livros) só serve como smoke.

## Como rodar

```bash
make perf-smoke           # sanidade: 1 VU, bate em todos os endpoints uma vez
make perf                 # roda todos os cenários em sequência

# Um cenário específico:
k6 run perf/scenarios/book-detail.js
```

A mesma suíte é usada para **popular os dashboards do Grafana** antes de
recapturar os screenshots — os comandos estão na §8 de
[`docs/observabilidade.md`](../docs/observabilidade.md).

## Variáveis de ambiente (runtime do K6/seed)

Passadas via `k6 run -e VAR=valor` ou pelo ambiente. **Não** são variáveis da
aplicação (por isso não estão em `.env.example`).

| Variável | Default | Descrição |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL base da API |
| `VUS` / `DURATION` | `10` / `30s` | carga dos cenários de leitura |
| `SEARCH_VUS` | `4` | concorrência da busca do catálogo (latência, não throughput) |
| `WRITE_RATE` / `WRITE_DURATION` | `10` / `30s` | taxa (iter/s) e duração do fluxo de escrita |
| `READER_EMAIL` / `READER_PASSWORD` | seed dev | credenciais do leitor |
| `LIBRARIAN_EMAIL` / `LIBRARIAN_PASSWORD` | seed dev | credenciais do bibliotecário |
| `PERF_BOOKS` / `PERF_AUTHORS` | `250000` / `5000` | volume do seed de performance |

Exemplo com carga maior:

```bash
k6 run -e VUS=50 -e DURATION=1m perf/scenarios/catalog-search.js
```

## Diagnóstico da busca do catálogo (otimização aplicada)

O `EXPLAIN (ANALYZE)` da query original de `bookRepository.findBooks` revelou dois
gargalos que o índice `books_title_trgm_idx` sozinho não resolvia:

1. **`OR` cruzando tabelas** (`books.title` **ou** `authors.name` via join) → o
   planner escolhia *hash join + seq scan* em `books`, ignorando o trigram.
2. **`_count` de cópias disponíveis** gerava um `GROUP BY` sobre **toda** a tabela
   `copies` (~500k linhas) a cada listagem, mesmo sem busca.

Correção (só reescrita de query, sem mudar o schema):

1. Resolver primeiro os IDs dos Autores que casam (tabela pequena) e filtrar por
   `title ILIKE '%x%' OR authorId IN (...)` — assim o trigram de título é usado e o
   `OR` fica todo em `books`. Resultado idêntico ao anterior.
2. Contar as Cópias `available` **apenas dos livros da página** (`groupBy` com
   `bookId IN (...)`), em vez de agregar toda a tabela `copies`.

Efeito: p95 da busca caiu de **~5,6 s → ~360 ms** (SEARCH_VUS=4). O custo remanescente
é o `count(*)` exato do total — se necessário, avaliar keyset pagination ou contagem
aproximada.

> A migration `seed-perf.ts` roda `VACUUM (ANALYZE)` após o bulk insert para atualizar
> estatísticas e o *visibility map* (index-only scans sem heap fetches).

## Estrutura

```
perf/
  lib/config.js      # BASE_URL, credenciais, perfis de carga, thresholds
  lib/http.js        # wrapper: request + check + Trend por operação
  lib/setup.js       # login (leitor/bibliotecário) + pool de bookIds
  scenarios/
    catalog-search.js  # GET /books?search= (busca do catálogo)
    book-detail.js     # GET /books/:id                    (RNF-1)
    reader-lists.js    # GET /me/reservations + /me/loans   (RNF-4)
    loan-return.js     # reserva → empréstimo → devolução   (RNF-2 + RNF-3)
  smoke.js           # sanidade rápida (1 VU, todos os endpoints)
```
