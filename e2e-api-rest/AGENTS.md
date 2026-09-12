# AGENTS.md — testes E2E da API REST

Complementa o [`AGENTS.md`](../AGENTS.md) da raiz. Vale para tudo dentro de `e2e-api-rest/`.

## O que esta pasta é

Playwright **só contra o contrato HTTP**: API em `:3000`, Postgres em `:5432` e o
**Keycloak em `https://localhost:8443`** (Fase 2: TLS com a CA local de `make
certs`). Sem SPA, sem servidor de capas, sem Mailpit na mão — e **sem navegador:
nenhum teste usa `page`, então `playwright install` é desnecessário**, local e no CI.
O `webServer` sobe só a API; o `global-setup.ts` espera o discovery do realm,
aplica migrations e roda o seed antes do primeiro teste. Sem mock, sem stub.

É irmã da suíte de UI (`e2e/`), não substituta: os três specs copiados de lá
(`contrato-api`, `autorizacao-api`, `regras-negocio-api`) rodam nas duas suítes.
Aqui eles existem para que o contrato HTTP seja verificável sem subir Chromium,
Vite e capas — o job `e2e-api-rest-ci` roda em paralelo ao `e2e-ci` no gate.

## Onde cada cenário vai

| Arquivo | O que entra |
|---|---|
| `contrato-api.spec.ts` | Caminho feliz no JSON, validação de entrada, shape, paginação, identidade |
| `autorizacao-api.spec.ts` | 401, 403, papéis e isolamento entre Leitores |
| `regras-negocio-api.spec.ts` | Prazo (RN-1/RN-5/RN-6) e concorrência: a última Cópia (RN-3), a Reserva duplicada (RN-9), o teto por Leitor (RN-10) e o cancelamento (RN-11), que disputa a mesma linha com a efetivação no balcão |
| `contrato-extensoes.spec.ts` | Cenários que só esta suíte tem: `/health`, filtros `search`/`genre`, filtro `?userId=` de `/loans`, `/me` do Bibliotecário, envelope de erro fora das rotas (404 JSON, corpo malformado → 422) |
| `helpers.ts` | Login por token (`apiLogin`, client `biblioteca-e2e`), arrange via API, atores isolados |
| `db.ts` | Fixtures que mexem no relógio dos dados |

## Regras (herdadas de `e2e/AGENTS.md` — valem aqui inteiras)

**Valor numérico de regra se confere no JSON.** As 12h de RN-1 e os 7 dias de
RN-8 se afirmam sobre `expiresAt` e `dueAt` da resposta, nunca sobre texto formatado.

**Um contexto HTTP por ator** (`newActor`) — e por requisição quando o teste é
de concorrência: um `APIRequestContext` reaproveita a conexão e enfileira as
chamadas, o que testaria serialização, não corrida. Para requisições concorrentes
**do mesmo Leitor** (RN-9, RN-10) use `newActors(playwright, email, n)`: ele cria os
contextos em sequência porque o primeiro `GET /me` de uma conta é o que provisiona o
espelho local dela, e dois logins simultâneos disputariam o mesmo INSERT.

**Tempo se adianta, não se espera.** Use as fixtures de `db.ts`
(`expireReservation`, `expireReservationAsJobWould`); o job de expiração da API
roda a cada minuto e processa todo dado que o teste deixar vencido — conte com
isso ao afirmar sobre estado posterior.

**Cenário devolve o que consumiu.** `releaseReservation` (`db.ts`) grava
`cancelledAt` e libera a Cópia na mesma transação, sem gastar uma requisição de
negócio. Para exercitar o caminho de produção há `apiCancelReservation` (RF-L8) e,
para o que já virou Empréstimo, `PATCH /loans/:id/return`.

**Expiração e cancelamento têm campos separados** desde a issue #20: `expiredAt` é
do job (RN-1) e `cancelledAt` é do Leitor (RF-L8). `expireReservationAsJobWould`
grava o primeiro — afirmar sobre o campo errado faz um teste de "cancelou" passar
sobre uma expiração.

**O Keycloak não é opcional.** Sem ele a suíte inteira falha com 401; o
`global-setup` confere o discovery antes do primeiro teste e falha dizendo o que fazer.

**Token vem do Keycloak, id vem da nossa base.** `apiLogin()` devolve token +
o `users.id` LOCAL (o que Reservas e Empréstimos referenciam). O `sub` do token
é outro identificador.

## Convivência dos Livros com a suíte de UI

Os mesmos Livros do seed são usados pelas duas suítes. No **CI não há conflito**:
cada job tem banco próprio. **Localmente, não rode as duas suítes ao mesmo
tempo contra o mesmo banco** — uma reserva daqui muda a Disponibilidade que um
spec de lá afirma. Rode sequencialmente (`make e2e-api` e depois `make e2e`, ou
o contrário). Os cenários de `contrato-extensoes.spec.ts` não consomem Cópia em
caráter permanente justamente para reduzir esse atrito.

Leitores do seed e senha: ver a tabela equivalente em [`e2e/AGENTS.md`](../e2e/AGENTS.md)
— `leitor@biblioteca.dev` tem Reserva e Empréstimo, `leitor2@biblioteca.dev`
está limpo, `bibliotecario@biblioteca.dev` é Carlos Mendes.

## Um Leitor por cenário que cria Reserva

O equivalente da tabela de Livros, do lado de quem reserva — e a razão de esta suíte
ter ficado vermelha quando RN-9 e RN-10 chegaram à API (issues #28, #29, #30). A
Reserva passou a ser um recurso **do Leitor**: o mesmo Leitor não tem duas Reservas
ativas do mesmo Livro (Empréstimo em aberto do título conta junto) e não passa de
três ativas. Como o banco é o mesmo do começo ao fim da suíte, um Leitor
reaproveitado acumula, e a partir de certo ponto o pedido é recusado com
`DUPLICATE_RESERVATION` ou `RESERVATION_LIMIT_REACHED` onde o teste esperava 201 —
falha por acumulação, não por defeito do sistema.

Por isso **cada cenário que cria Reserva tem a própria conta**, declarada por nome em
`helpers.ts` e alocada na tabela de [`e2e/AGENTS.md`](../e2e/AGENTS.md) (as duas
suítes compartilham os specs, então compartilham a alocação). As contas vivem em
`keycloak/realm-biblioteca.json` com o prefixo **`e2e-`**, que delimita o território
dos testes: conta criada à mão para explorar o produto pode usar
`leitorN@biblioteca.dev` sem colidir. Nenhuma tem linha no seed — o espelho local
nasce no primeiro `GET /me` (JIT provisioning, ADR-0009). **Conta nova é mudança de
realm, e mudança de realm é arquivo** (`keycloak/README.md`).

A Ana do seed ficou com o que **lê** — as listas de `/me/*` e o filtro `?userId=` do
balcão dependem do estado que o seed dá a ela.

E a fila de US-03 são **oito contas distintas**, não duas alternadas: com RN-9 um
Leitor não disputa consigo mesmo, e alternar contas faria sete perdedores receberem
`DUPLICATE_RESERVATION` — a contagem `1× 201 + 7× 409` continuaria batendo e a
proteção da última Cópia ficaria sem cobertura. É a asserção do `code`
(`NO_COPY_AVAILABLE`) que denuncia.

## Rodar

```bash
make db-up           # certs + Postgres, keycloak-db, Mailpit e Keycloak
npm install          # primeira vez (não baixa navegador nenhum)
npm test             # suíte inteira
npx playwright test contrato-extensoes.spec.ts -g "malformado"   # um cenário
../packages/api/node_modules/.bin/tsc --noEmit       # typecheck (este pacote não tem tsc próprio)
```

## Armadilha do ambiente

**`tsx watch` não recarrega em `/mnt/c`.** O inotify do WSL2 não dispara para
arquivos do sistema de arquivos do Windows, e `reuseExistingServer` fora do CI
reaproveita o processo antigo. Depois de mudar código da API, mate o servidor
(`pkill -f "tsx watch"`) antes de rodar de novo.
