# AGENTS.md — testes E2E

Complementa o [`AGENTS.md`](../AGENTS.md) da raiz. Vale para tudo dentro de `e2e/`.

## O que esta pasta é

Playwright contra o **stack real**: API em `:3000`, SPA em `:5173`, Postgres em
`:5432` e o servidor de capas em `:8080`. Sem mock, sem stub, sem interceptação
de rede. O `webServer` do `playwright.config.ts` sobe API e Web; o
`global-setup.ts` aplica migrations e roda o seed uma vez, antes do primeiro
teste. Postgres e capas vêm do `docker compose up -d` — os dois, não só o banco.

Os `*.test.ts` dentro de `packages/api` **não são E2E**: são Vitest + supertest com
`vi.mock` nos repositórios, justamente para não tocar o banco. Um bug que só
aparece com Prisma e Postgres de verdade passa por eles.

## Onde cada cenário vai

| Arquivo | O que entra |
|---|---|
| `<área>.spec.ts` (`catalogo`, `reservas-leitor`, `bibliotecario`…) | O que o usuário vê e faz no navegador |
| `autorizacao-api.spec.ts` | 401, 403 e isolamento entre Leitores |
| `contrato-api.spec.ts` | Caminho feliz no JSON, validação de entrada, shape, paginação, sessão |
| `regras-negocio-api.spec.ts` | Prazo e concorrência — o que o navegador não consegue expressar |
| `helpers.ts` | Login, arrange via API, atores isolados |
| `db.ts` | Fixtures que mexem no relógio dos dados |

`screenshots.spec.ts` também fica fora da suíte, atrás de `SHOTS=1`: ele cria
Reserva só para posar para a foto e estragaria a Disponibilidade que os outros
specs afirmam. Roda por `make screenshots` e grava em `assets/images/`.

`dashboards.spec.ts` **não faz parte da suíte**: fica atrás de `OBS=1`, roda com
`playwright.dashboards.config.ts` e é chamado por `make obs-dashboards`.

## Regras

**Valor numérico de regra se confere no JSON.** As 12h de RN-1 e os 7 dias de RN-8
chegam à tela como `16/08/2026 22:31`. Verificar só o texto formatado deixa passar
a troca de 12h por 24h — a suíte inteira continua verde. Afirme sobre `expiresAt` e
`dueAt` na resposta; a tela verifica que o valor *aparece*, não qual é.

**Um contexto HTTP por ator.** A API dá precedência ao cookie `access_token` sobre o
header `Authorization`, então dois atores no mesmo `APIRequestContext` sobrescrevem
a sessão um do outro — e um teste de isolamento passa por acidente. Use
`newActor(playwright, email)` e chame `dispose()` no fim.

**Concorrência exige um contexto por requisição.** Um `APIRequestContext` reaproveita
a conexão e enfileira as requisições: `Promise.all` sobre o mesmo contexto testa
serialização, não concorrência. O teste da última Cópia cria oito contextos de
propósito. Sem isso ele passava contra o código que ainda tinha a reserva dupla.

**Tempo se adianta, não se espera.** Prazo de 12h não é observável esperando, e a API
não expõe endpoint que envelheça uma Reserva. Use as fixtures de `db.ts`
(`expireReservation`, `setReservationExpiry`, `expireAllReservationsOf`) — o resto do
caminho continua sendo o de produção. Para UI que depende do relógio (a contagem
regressiva de US-04, que avança a cada 30 s), use `page.clock.install()` antes do
`goto` e `fastForward`, nunca `waitForTimeout`.

**O servidor de capas não é opcional.** Com `coverUrl` no seed e o container
`capas` fora do ar, o proxy do Vite devolve 502 para cada `/capas/…` e as
requisições da API ficam atrás das imagens no limite de conexões do Chromium:
`catalogo.spec.ts` quebra por timeout no filtro de busca — não cai em fallback
silencioso. Medido: 3 testes vermelhos nesse estado. `docker compose up -d`
antes de rodar a suíte, e o job `e2e-ci` sobe o serviço explicitamente.

**O job de expiração está rodando.** A API sobe o job de `index.ts`, que a cada minuto
cancela Reservas vencidas e devolve as Cópias ao acervo. Todo dado que o teste vencer
será processado por ele em até 60 s — conte com isso ao afirmar sobre estado posterior.

**Um Livro por cenário que consome Cópia.** O banco é compartilhado, `workers: 1`,
`fullyParallel: false`, e os arquivos rodam em ordem alfabética. Cada teste que cria
Reserva usa um Livro dedicado para não mexer na Disponibilidade que outro teste afirma:

| Livro | Quem usa |
|---|---|
| Ensaio sobre a Cegueira | seed — 0 disponíveis, só leitura |
| O Nome de Deus | `regras-negocio-api` — disputa pela última Cópia |
| A Paixão Segundo G.H. | `regras-negocio-api` — expiração ponta a ponta |
| Dom Casmurro | `contrato-api` — POST /reservations |
| Memórias Póstumas de Brás Cubas | `contrato-api` — POST /loans e RN-6 |
| A Hora da Estrela | `contrato-api` (devolução) e `reservas-leitor` (expira em breve) |
| A Metamorfose | `autorizacao-api` (isolamento) e `bibliotecario` (modal) |
| Cem Anos de Solidão | `bibliotecario` — US-10 |
| O Amor nos Tempos do Cólera | `bibliotecario` — US-11 |
| O Processo | `reservas-leitor` — US-03 |

Ao adicionar cenário que reserve, escolha um Livro livre ou devolva a Cópia no fim.

**Leitores do seed.** `leitor@biblioteca.dev` (Ana Lima) tem Reserva e Empréstimo;
`leitor2@biblioteca.dev` (Bruno Costa) não tem nada, e é isso que o torna útil —
isolamento e estado vazio. `bibliotecario@biblioteca.dev` é Carlos Mendes. Senha
`senha123` para todos.

## Rodar

```bash
docker compose up -d          # Postgres, na raiz do repo
npm install                   # primeira vez
npm run install:browsers      # baixa o Chromium, primeira vez
npm test                      # suíte inteira
npx playwright test contrato-api.spec.ts -g "RN-1"   # um cenário
../packages/api/node_modules/.bin/tsc --noEmit       # typecheck (este pacote não tem tsc próprio)
```

## Duas armadilhas do ambiente

**`tsx watch` não recarrega em `/mnt/c`.** O inotify do WSL2 não dispara para arquivos
do sistema de arquivos do Windows, e o `playwright.config.ts` usa
`reuseExistingServer` fora do CI. Depois de mudar código da API, **mate o servidor**
(`pkill -f "tsx watch"`) antes de rodar de novo — senão você testa a versão anterior e
conclui o oposto do que o código faz.

**`db.ts` importa o Prisma Client de `packages/api/node_modules`** por caminho relativo.
É de propósito: evita duplicar dependência e schema aqui. Se o import quebrar, rode
`npm run db:generate` em `packages/api`.
