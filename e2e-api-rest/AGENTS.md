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
| `regras-negocio-api.spec.ts` | Prazo (RN-1/RN-5/RN-6) e concorrência pela última Cópia |
| `contrato-extensoes.spec.ts` | Cenários que só esta suíte tem: `/health`, filtros `search`/`genre`, filtro `?userId=` de `/loans`, `/me` do Bibliotecário, envelope de erro fora das rotas (404 JSON, corpo malformado → 422) |
| `helpers.ts` | Login por token (`apiLogin`, client `biblioteca-e2e`), arrange via API, atores isolados |
| `db.ts` | Fixtures que mexem no relógio dos dados |

## Regras (herdadas de `e2e/AGENTS.md` — valem aqui inteiras)

**Valor numérico de regra se confere no JSON.** As 12h de RN-1 e os 7 dias de
RN-8 se afirmam sobre `expiresAt` e `dueAt` da resposta, nunca sobre texto formatado.

**Um contexto HTTP por ator** (`newActor`) — e por requisição quando o teste é
de concorrência: um `APIRequestContext` reaproveita a conexão e enfileira as
chamadas, o que testaria serialização, não corrida.

**Tempo se adianta, não se espera.** Use as fixtures de `db.ts`
(`expireReservation`, `expireReservationAsJobWould`); o job de expiração da API
roda a cada minuto e processa todo dado que o teste deixar vencido — conte com
isso ao afirmar sobre estado posterior.

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
