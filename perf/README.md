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

### Resultados atuais (250k livros, WSL2 6 GB)

| Métrica | p95 medido | Alvo | Status |
|---|---|---|---|
| `book_detail` | ~30 ms | < 300 ms | ✅ |
| `reservation` | ~17 ms | < 3 s | ✅ |
| `loan` / `return` | ~20 ms | < 3 s | ✅ |
| `my_lists` | ~350 ms | < 500 ms | ✅ (¹) |
| `catalog_search` | **~5,6 s** | < 400 ms | ❌ (²) |

¹ `my_lists` cresce conforme o histórico de empréstimos do leitor se acumula entre
execuções; rode `make perf-seed -- --reset` para uma medição limpa.

² **Achado:** a busca do catálogo não atinge a meta em escala. A paginação faz
`count(*)` com `title ILIKE '%x%' OR authors.name ILIKE '%x%'`; o `OR` que cruza a
tabela `authors` via join impede o uso do índice trigram e força um *sequential
scan* (parallel seq scan no `EXPLAIN`). Sob concorrência isso satura a CPU e o p95
degrada de ~1 s (1 VU) para vários segundos. O índice `books_title_trgm_idx` (branch
`perf/consultas-catalogo`) sozinho **não** resolve esse caminho de query.

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

## Diagnóstico da busca do catálogo

O índice `books_title_trgm_idx` acelera `title ILIKE '%x%'` **isoladamente**, mas a
query de listagem atual (`bookRepository.findBooks`) não se beneficia dele por dois
motivos, comprováveis via `EXPLAIN (ANALYZE)`:

1. O `OR` cruza tabelas (`books.title` **ou** `authors.name`) sobre um join → o
   planner escolhe *hash join + seq scan* em vez do índice trigram.
2. A paginação executa um `count(*)` sem `LIMIT`, que não pode parar cedo e varre
   todo o conjunto filtrado.

Caminhos possíveis (fora do escopo destes testes, decisão do time): denormalizar o
nome do autor em `books` (e indexá-lo com trigram), separar a busca por título e por
autor, ou substituir o `count` exato por uma contagem aproximada/keyset pagination.

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
