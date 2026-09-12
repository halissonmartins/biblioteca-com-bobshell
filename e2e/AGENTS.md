# AGENTS.md — testes E2E

Complementa o [`AGENTS.md`](../AGENTS.md) da raiz. Vale para tudo dentro de `e2e/`.

## O que esta pasta é

Playwright contra o **stack real**: API em `:3000`, SPA em `:5173`, Postgres em
`:5432`, o servidor de capas em `:8080` e o **Keycloak em
`https://localhost:8443`** (Fase 2: TLS com a CA local de `make certs`; o
`ignoreHTTPSErrors` do Playwright cobre o Chromium, e o fetch do global-setup tem
fallback próprio). Sem mock, sem stub, sem interceptação de rede — nem no login:
os testes preenchem a tela do Keycloak de verdade. O `webServer` do
`playwright.config.ts` sobe API e Web; o `global-setup.ts` espera o Keycloak,
aplica migrations e roda o seed uma vez, antes do primeiro teste. Postgres,
keycloak-db, Mailpit, capas e Keycloak vêm do `docker compose up -d`.

Os `*.test.ts` dentro de `packages/api` **não são E2E**: são Vitest + supertest com
`vi.mock` nos repositórios, justamente para não tocar o banco. Um bug que só
aparece com Prisma e Postgres de verdade passa por eles.

**Suíte irmã: `e2e-api-rest/`.** Os três specs de API desta pasta
(`contrato-api`, `autorizacao-api`, `regras-negocio-api`) também rodam lá, sem
navegador — são cópias mantidas em paralelo, então **uma mudança de contrato
precisa ser aplicada nas duas** (o job `e2e-api-rest-ci` do gate executa a
cópia contra banco próprio, por isso não há conflito no CI). Localmente, não
rode as duas suítes ao mesmo tempo contra o mesmo banco: os Livros da tabela
abaixo são consumidos pelos dois lados.

## Onde cada cenário vai

| Arquivo | O que entra |
|---|---|
| `<área>.spec.ts` (`catalogo`, `reservas-leitor`, `bibliotecario`…) | O que o usuário vê e faz no navegador |
| `autenticacao.spec.ts` | Entrada, saída, guarda de rota e **auto-cadastro** (a tela é a do Keycloak) |
| `autorizacao-api.spec.ts` | 401, 403 e isolamento entre Leitores |
| `contrato-api.spec.ts` | Caminho feliz no JSON, validação de entrada, shape, paginação, sessão |
| `regras-negocio-api.spec.ts` | Prazo e concorrência — o que o navegador não consegue expressar: a última Cópia disputada (RN-3), o prazo que vence sozinho (RN-1/RN-5), a Reserva convertida duas vezes (RN-6) e os dois limites por Leitor (RN-9, RN-10) |
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

**Um contexto HTTP por ator.** Cada ator carrega o próprio token e o próprio jogo
de cookies de sessão do Keycloak; compartilhar contexto mistura as duas sessões no
mesmo jar — e um teste de isolamento passa por acidente. Use
`newActor(playwright, email)` e chame `dispose()` no fim.

**`loginUI` espera o botão "Sair", não o Catálogo.** O Catálogo é rota pública e
aparece igual sem sessão. Quem esperasse só por ele voltaria enquanto o `GET /me`
ainda estava no ar, e o passo seguinte navegaria como visitante — foi exatamente
assim que US-03 falhou pedindo um botão "Reservar" que a página só mostra a quem
entrou. O "Sair" só existe com sessão. Vale o mesmo para `registrarUI`.

**Auto-cadastro não pede senha — a senha vem depois do e-mail (Fase 2).** Com
`verifyEmail: true`, o Keycloak registra a conta só com e-mail e nome; quem
confirma o endereço pelo link do Mailpit cai no formulário "defina sua senha"
(`registrarUI` para naquela tela; `definirSenhaInicial` submete;
`registrarEEntrar` faz o caminho completo até logado). Testes que precisam da
tela de verificação pendente devem usar o formulário direto, não o helper.

**Token de API vem do Keycloak, não da API.** `apiLogin()` bate no token endpoint
do realm pelo client `biblioteca-e2e` (Direct Access Grant — o `biblioteca-web`
recusa com `unauthorized_client` desde a Fase 2) e depois em `GET /me` para
descobrir o **id local** — que é o que Reservas e Empréstimos referenciam, e o
que os specs comparam. O `sub` do token é outro identificador; não confunda os dois.

**Concorrência exige um contexto por requisição.** Um `APIRequestContext` reaproveita
a conexão e enfileira as requisições: `Promise.all` sobre o mesmo contexto testa
serialização, não concorrência. O teste da última Cópia cria oito contextos de
propósito. Sem isso ele passava contra o código que ainda tinha a reserva dupla.

Quando as requisições concorrentes são **do mesmo Leitor** — os cenários de RN-9 e
RN-10 —, use `newActors(playwright, email, n)`: ele cria os contextos em sequência,
porque o primeiro `GET /me` de uma conta é o que provisiona o espelho local dela e
dois logins simultâneos de quem ainda não tem linha em `users` disputariam o mesmo
INSERT. A concorrência que interessa é a das requisições de negócio, depois.

**Tempo se adianta, não se espera.** Prazo de 12h não é observável esperando, e a API
não expõe endpoint que envelheça uma Reserva. Use as fixtures de `db.ts`
(`expireReservation`, `setReservationExpiry`, `expireAllReservationsOf`) — o resto do
caminho continua sendo o de produção. Para UI que depende do relógio (a contagem
regressiva de US-04, que avança a cada 30 s), use `page.clock.install()` antes do
`goto` e `fastForward`, nunca `waitForTimeout`.

**O Keycloak não é opcional.** Sem ele ninguém autentica e a suíte inteira falha
com 401 — sintoma que aponta para o lugar errado. O `global-setup.ts` confere o
discovery do realm antes de qualquer teste e falha dizendo o que fazer. Ele leva
~40 s para subir e importar o realm na primeira vez; `docker compose up -d --wait`
segura até lá.

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
| O Nome de Deus | `regras-negocio-api` — disputa pela última Cópia (devolve as duas Cópias no fim) |
| A Paixão Segundo G.H. | `regras-negocio-api` — expiração ponta a ponta e Reserva disputada no balcão (os dois devolvem a Cópia no fim) |
| Dom Casmurro | `contrato-api` (POST /reservations) e `regras-negocio-api` (teto de RN-10, devolve) |
| Memórias Póstumas de Brás Cubas | `contrato-api` — POST /loans e RN-6 |
| A Hora da Estrela | `contrato-api` (devolução), `regras-negocio-api` (Reserva duplicada de RN-9, devolve) e `reservas-leitor` (expira em breve) |
| A Metamorfose | `autorizacao-api` (isolamento) e `bibliotecario` (modal) |
| Cem Anos de Solidão | `bibliotecario` (US-10) e `regras-negocio-api` (teto de RN-10, devolve) |
| O Amor nos Tempos do Cólera | `bibliotecario` (US-11) e `regras-negocio-api` (teto de RN-10, devolve) |
| O Processo | `reservas-leitor` (US-03) e `regras-negocio-api` (teto de RN-10, devolve) |

Ao adicionar cenário que reserve, escolha um Livro livre ou devolva a Cópia no fim.
Cenário que só precisa da Cópia durante a asserção devolve com `releaseReservation`
(`db.ts`) — cancela e libera a Cópia na mesma transação, como o job faria, sem
esperar o tique de um minuto. Quem converte em Empréstimo devolve pelo caminho de
produção (`PATCH /loans/:id/return`).

**Um Leitor por cenário que cria Reserva.** É o outro lado da tabela acima, e
existe desde RN-9 e RN-10 (issues #28, #29, #30): a Reserva passou a ser um recurso
**do Leitor**, não só da Cópia. O mesmo Leitor não tem duas Reservas ativas do mesmo
Livro — Empréstimo em aberto do título conta junto — e não passa de três ativas. Com
o banco compartilhado do começo ao fim da suíte, um Leitor reaproveitado acumula, e a
partir de certo ponto os pedidos são recusados por acumulação em vez de por defeito
do sistema. Foi exatamente assim que as duas suítes ficaram vermelhas quando as
regras chegaram à API: `DUPLICATE_RESERVATION` e `RESERVATION_LIMIT_REACHED` onde o
teste esperava 201.

As contas ficam em `keycloak/realm-biblioteca.json` com o prefixo **`e2e-`** e vêm
nomeadas por cenário em `helpers.ts`. O prefixo delimita o território dos testes:
conta criada à mão para explorar o produto pode usar `leitorN@biblioteca.dev` sem
colidir com o que a suíte espera encontrar. Nenhuma delas tem linha no seed — o
espelho local nasce no primeiro `GET /me` (JIT provisioning, ADR-0009). **Conta nova
é mudança de realm, e mudança de realm é arquivo:** editar o JSON e recriar o
contêiner para reimportar (`keycloak/README.md`), nunca clicar no admin console.

| Leitor | Quem usa |
|---|---|
| `leitor@biblioteca.dev` (Ana Lima) | seed — Reserva + Empréstimo de "Ensaio sobre a Cegueira". É o estado que `/me/*`, o balcão e `reservas-leitor` **leem**; só `reservas-leitor` US-04 cria Reserva com ela |
| `leitor2@biblioteca.dev` (Bruno Costa) | `autorizacao-api` — isolamento e estado vazio |
| `e2e-reserva@` | `contrato-api` RN-1 — POST /reservations |
| `e2e-emprestimo@` | `contrato-api` RN-8 — POST /loans |
| `e2e-devolucao@` | `contrato-api` RN-5 — PATCH /loans/:id/return |
| `e2e-vencida@` | `contrato-api` RN-6 — Reserva vencida não vira Empréstimo |
| `e2e-ultima-copia@` | `regras-negocio-api` US-03 — dono da primeira Cópia |
| `e2e-fila1@` … `e2e-fila8@` | `regras-negocio-api` US-03 — a fila pela última Cópia |
| `e2e-expiracao@` | `regras-negocio-api` RN-1/RN-5 |
| `e2e-balcao-duplo@` | `regras-negocio-api` RN-6 — seis efetivações da mesma Reserva |
| `e2e-duplicada@` | `regras-negocio-api` RN-9 |
| `e2e-teto@` | `regras-negocio-api` RN-10 |
| `e2e-balcao-efetiva@` | `bibliotecario` US-10 |
| `e2e-balcao-expira@` | `bibliotecario` US-10 — Reserva que vence com o modal aberto |
| `e2e-balcao-devolve@` | `bibliotecario` US-11 |
| `e2e-tela-reserva@` | `reservas-leitor` US-03 |

**A fila de US-03 são oito contas distintas, não duas alternadas.** Com RN-9 um Leitor
não disputa consigo mesmo: alternando contas, sete perdedores recebem
`DUPLICATE_RESERVATION`, a contagem `1× 201 + 7× 409` continua batendo e o UPDATE
condicionado a `status: 'available'` — o que protege a última Cópia — fica sem
cobertura nenhuma. É a asserção do `code` (`NO_COPY_AVAILABLE`) que denuncia.

`bibliotecario@biblioteca.dev` é Carlos Mendes. Senha `Biblioteca#2026!` para todos
(política da Fase 2 exige 12+ caracteres).

## Rodar

```bash
make db-up                    # certs + Postgres, keycloak-db, Mailpit, capas e Keycloak
npm install                   # primeira vez
npm run install:browsers      # baixa o Chromium, primeira vez
npm test                      # suíte inteira
npx playwright test contrato-api.spec.ts -g "RN-1"   # um cenário
../packages/api/node_modules/.bin/tsc --noEmit       # typecheck (este pacote não tem tsc próprio)
```

## Duas armadilhas do ambiente

**Nem `tsx watch` nem o Vite recarregam em `/mnt/c`.** O inotify do WSL2 não dispara
para arquivos do sistema de arquivos do Windows, e o `playwright.config.ts` usa
`reuseExistingServer` fora do CI. Depois de mudar código, **mate os dois servidores**
(`pkill -f "tsx watch"; pkill -f vite`) antes de rodar de novo — senão você testa a
versão anterior e conclui o oposto do que o código faz. Vale para a SPA tanto quanto
para a API: uma mudança em `useAuth.tsx` que o navegador nunca recebeu já custou uma
sessão inteira de diagnóstico do fluxo de login.

**`db.ts` importa o Prisma Client de `packages/api/node_modules`** por caminho relativo.
É de propósito: evita duplicar dependência e schema aqui. Se o import quebrar, rode
`npm run db:generate` em `packages/api`.
