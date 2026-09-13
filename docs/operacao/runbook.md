# Runbook de operação

O que fazer quando algo para de funcionar. Cada procedimento segue a mesma
ordem: **sintoma → verificação → ação → confirmação**. Os comandos são para
copiar e rodar da raiz do repositório, contra o ambiente do `docker-compose.yml`.

Este documento **não repete** o que já está escrito em outro lugar: quando o
diagnóstico já existe em [`seguranca.md`](../seguranca.md) ou
[`observabilidade.md`](../observabilidade.md), o procedimento aponta para lá.

Termos seguem o [glossário](../produto/glossario.md). Prazos e tetos das regras
de negócio são citados pela constante que os define, não por número solto: se o
valor mudar, este texto continua certo.

> **O que este runbook não cobre, porque ainda não existe no repositório:**
> deploy e rollback (não há `Dockerfile` nem job de deploy no CI), backup e
> restore dos dois bancos, regras de alerta no Prometheus e contatos de
> escalonamento. Nenhuma seção abaixo descreve procedimento para eles.

---

## 1. Mapa do sistema em operação

### Perfil padrão — `docker compose up -d --wait`

| Serviço | Container | Porta no host | Healthcheck | Quando cai |
|---|---|---|---|---|
| API | processo Node (`make dev-api`) | `3000` | `GET /health` → `{"status":"ok","db":"ok"}`; `503` com `db: "error"` se o banco não responde | a SPA não carrega nada: Catálogo, Reservas e balcão param |
| SPA | processo Vite (`make dev-web`) | `5173` | a própria página | ninguém entra no sistema. O Vite faz proxy de `/api` → `:3000` e `/capas` → `:8080` |
| `postgres` | `biblioteca-postgres` | `5432` | `pg_isready` | `/health` responde `503`, e toda rota que lê dado responde `500` |
| `keycloak` | `biblioteca-keycloak` | `8443` (https) · `9002` (management) | `http://localhost:9002/health/ready` | ninguém entra; ver [§3.3](#33-keycloak-indisponível) |
| `keycloak-db` | `biblioteca-keycloak-db` | interna | `pg_isready` | o Keycloak deixa de ficar `healthy` |
| `capas` | `biblioteca-capas` | `8080` | `wget http://localhost/` | capas quebradas no Catálogo; o resto funciona |
| `mailpit` | `biblioteca-mailpit` | `8025` | o da própria imagem (aparece `healthy` no `compose ps`) | e-mail de verificação e de reset de senha não chega; login de conta já confirmada segue funcionando |

### Perfil `obs` — `make obs-up`

Collector, Jaeger, Prometheus, Grafana e Graylog. Portas e credenciais em
[`observabilidade.md` §2 e §7](../observabilidade.md#7-como-rodar). **Se a
stack de observabilidade cai, o produto não cai:** o exportador OTLP desiste em
silêncio e a API segue atendendo. O que se perde é a visão do incidente.

### Visão rápida de tudo

```bash
docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
curl -s -m 5 http://localhost:3000/health; echo
curl -s -m 5 http://localhost:9002/health/ready | grep -m1 '"status"'
curl -s -o /dev/null -w 'capas %{http_code}\n' -m 5 http://localhost:8080/
```

Os cinco serviços do perfil padrão devem aparecer `(healthy)`, e a API deve
responder `{"status":"ok","db":"ok"}`.

---

## 2. Subida e parada

### Subir, nesta ordem

```bash
make db-up      # gera os certificados se faltarem e sobe o perfil padrão; espera tudo ficar healthy
make migrate    # aplica migrations pendentes e regenera o Prisma Client
make dev        # API (:3000) + SPA (:5173)
make obs-up     # opcional — observabilidade
```

A ordem importa por dois motivos:

- **A API precisa do Keycloak antes de validar o primeiro token.** Ela busca o
  JWKS do realm na primeira requisição autenticada. Sem o Keycloak no ar, essa
  requisição responde `401 TOKEN_INVALID`.
- **A API precisa da CA local no ambiente antes de subir.** Quem entrega
  `NODE_EXTRA_CA_CERTS` é o script `dev` de `packages/api`. Subir a API por
  outro caminho sem essa variável faz todo token falhar com erro de certificado
  (ver [`keycloak/README.md`](../../keycloak/README.md#console-e-postura-de-segurança)).

### Parar

`Ctrl+C` no `make dev` envia `SIGINT`, e `SIGTERM` tem o mesmo efeito. O
`shutdown()` de `packages/api/src/index.ts` faz, em ordem:

1. para o job de expiração de Reservas;
2. espera as requisições em curso terminarem (`server.close`);
3. desconecta o Prisma;
4. envia o último lote de telemetria e registra `API encerrada.`.

```bash
docker compose stop            # para os containers e PRESERVA os volumes
make obs-down                  # para a observabilidade e PRESERVA os dados
```

> **Nunca** use `docker compose down -v` para "reiniciar": além do banco do
> produto, isso apaga o banco do Keycloak (contas e o realm, se não foi
> exportado) e o histórico de métricas e logs.

### O que acontece na subida seguinte

O job de expiração **roda imediatamente ao subir** e depois a cada
`DEFAULT_INTERVAL_MS` (`packages/api/src/infra/jobs/expireReservations.ts`).
Toda Reserva que venceu enquanto a API estava fora do ar é expirada na
primeira execução, e a Cópia volta a `available` (RN-1, RN-5). **Não é preciso
ação manual depois de uma parada**, por mais longa que tenha sido.

Confirme no log da API, logo depois da subida:

```
[expireReservations] N reserva(s) expirada(s) em <ISO>
```

A linha só aparece quando `N > 0`.

---

## 3. Procedimentos por incidente

### 3.1 API fora do ar ou 5xx em alta

**Sintoma.** A SPA mostra erro em todas as telas, ou o painel **Taxa de erro
5xx** do dashboard *Biblioteca — Saúde da API* sobe.

**Verificação.**

```bash
curl -s -m 5 -w '\nHTTP %{http_code}\n' http://localhost:3000/health
```

| Resposta | Significa | Vá para |
|---|---|---|
| sem resposta (`HTTP 000`) | o processo não está no ar | ação A |
| `503 {"status":"degraded","db":"error"}` | o processo está no ar, e o banco não | ação B |
| `200 {"status":"ok","db":"ok"}` | processo e banco no ar; o 5xx está em rotas específicas | ação C |

A mesma taxa, direto no Prometheus (`http://localhost:9090`):

```promql
(sum(increase(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[15m])) or vector(0))
  / clamp_min(sum(increase(http_server_request_duration_seconds_count[15m])), 1)
```

**Ação A: processo fora do ar.** Suba de novo com `make dev-api` e leia as
primeiras linhas do log. As causas mais comuns na subida são porta `3000`
ocupada (`EADDRINUSE`) e `.env` ausente em `packages/api` (rode `make env`).

**Ação B: banco fora do ar.**

```bash
docker compose ps postgres
docker compose logs --tail 50 postgres
docker compose up -d --wait postgres
```

A API reconecta sozinha, sem precisar reiniciar.

**Ação C: 5xx em rotas específicas.** Localize a rota no painel **p95 por
rota** ou **Respostas por classe de status** do dashboard de SLO. Todo erro
não tratado é registrado no nível `error` com `trace_id`:

- no Graylog (`http://localhost:9001`), busque `level:error` e copie o
  `otel_trace_id`;
- no Jaeger (`http://localhost:16686`), abra o trace pelo id. O span do Prisma
  em vermelho indica se o erro veio do banco.

Sem a stack `obs`, o mesmo registro sai no stdout da API. O `X-Request-Id` da
resposta liga a tela ao log.

**Confirmação.** `/health` responde `200 {"status":"ok","db":"ok"}`, e a taxa de
5xx volta a zero numa janela de 5 minutos.

---

### 3.2 Todo pedido autenticado dá 401

**Sintoma.** A pessoa entra, mas toda tela depois do login falha, e a API
registra `TOKEN_INVALID` ou `TOKEN_EXPIRED`.

**Verificação e ação.** O roteiro, com a ordem e o motivo de cada passo, está
em [`seguranca.md` §8 — Diagnóstico de "tudo dá 401"](../seguranca.md#8-operação).
Em resumo, com os comandos:

```bash
# 1. o Keycloak está healthy?
docker compose ps keycloak

# 2. o discovery responde, e o issuer bate EXATAMENTE com KEYCLOAK_ISSUER_URL?
curl -sk -m 5 https://localhost:8443/realms/biblioteca/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
grep KEYCLOAK_ packages/api/.env

# 3. um token de verdade chega à API?
TOKEN=$(curl -sk -d 'grant_type=password&client_id=biblioteca-e2e' \
  -d 'username=leitor@biblioteca.dev&password=Biblioteca#2026!' \
  https://localhost:8443/realms/biblioteca/protocol/openid-connect/token \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
curl -s -m 5 -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $TOKEN" http://localhost:3000/me
```

O client `biblioteca-e2e` só existe no realm local
([`keycloak/README.md`](../../keycloak/README.md#clients)).

| Resultado do passo 3 | Causa provável |
|---|---|
| `401` com `TOKEN_INVALID` e issuer divergente no passo 2 | `KEYCLOAK_ISSUER_URL` diferente do `KC_HOSTNAME` do compose (esquema, porta, barra final) |
| `401` com `TOKEN_INVALID` e issuer igual | `KEYCLOAK_AUDIENCE` diferente do mapper `audience-biblioteca-api`, ou a API subiu sem `NODE_EXTRA_CA_CERTS` e não consegue buscar o JWKS |
| `200` | a API aceita tokens; o problema está na SPA (`VITE_KEYCLOAK_*` em `packages/web/.env`, lidas só na subida do Vite) |

Depois de corrigir um `.env`, **reinicie o processo**: nem a API nem o Vite
releem variáveis com o processo rodando.

**Confirmação.** O passo 3 responde `200` com o Leitor, e a tela *Minhas
Reservas* carrega na SPA.

---

### 3.3 Keycloak indisponível

**Sintoma.** A tela `/login` mostra *"Não foi possível falar com o serviço de
acesso. Ele pode estar fora do ar ou a rede pode estar bloqueando a
conexão."*, com o erro técnico em texto menor (`Failed to fetch`,
`net::ERR_CERT_AUTHORITY_INVALID`, `Network timed out`). O porquê dessa tela
está em [`seguranca.md` §8](../seguranca.md#8-operação).

**O que continua funcionando.**

- **Quem já está dentro segue usando o sistema até o token vencer**
  (`accessTokenLifespan` do realm, ver [`seguranca.md` §4](../seguranca.md#4-o-realm)).
  A API valida a assinatura contra o JWKS que já guardou em memória e não
  consulta o Keycloak a cada pedido.
- **Uma API que subiu depois da queda não aceita token nenhum**, porque nunca
  chegou a buscar o JWKS. Se possível, não reinicie a API durante uma queda do
  Keycloak.
- Login novo, cadastro e renovação de sessão param.

**Verificação.**

```bash
docker compose ps keycloak keycloak-db
curl -s -m 5 http://localhost:9002/health/ready
docker compose logs --tail 80 keycloak
```

| O que aparece | Ação |
|---|---|
| `keycloak-db` não está `healthy` | `docker compose up -d --wait keycloak-db`; o Keycloak se recupera quando o banco volta |
| o log do Keycloak fala de certificado (`tls.crt`) | os certificados de `make certs` sumiram ou venceram: `make certs` e depois `docker compose up -d --wait keycloak` |
| container reiniciando em laço, com `OutOfMemoryError` ou `Killed` | o `mem_limit` do serviço foi atingido; libere memória do WSL2 (ver [`observabilidade.md` §7 — Memória](../observabilidade.md#memória)) e suba de novo |
| `healthy`, mas o navegador recusa o certificado | a CA local não está confiável no SO ou no navegador: importe `keycloak/certs/ca.crt` |

**Ação.**

```bash
docker compose up -d --wait keycloak
```

> **`healthy` no `compose ps` não garante que o Keycloak já atende.** O
> healthcheck procura `"status": "UP"` em qualquer ponto da resposta, e as
> verificações internas aparecem como `UP` antes do status geral. Logo depois
> de um `up -d --wait`, `/health/ready` ainda pode responder `"status": "DOWN"`
> no topo por alguns segundos. Confira a **primeira** linha `"status"` e repita
> até ela ficar `UP`.

**Confirmação.** A primeira linha `"status"` de `/health/ready` é `"UP"`, o discovery do
[§3.2](#32-todo-pedido-autenticado-dá-401) responde com o issuer certo, e a tela
de acesso abre o formulário do Keycloak.

---

### 3.4 Job de expiração parado ou com erro

**Por que importa.** O job é quem aplica RN-1 e RN-5 no banco. Parado, a
Reserva continua sendo apresentada como expirada: o status é calculado a cada
leitura a partir de `expiresAt`. **A Cópia, porém, fica presa em `reserved`**,
e nenhum outro Leitor consegue reservá-la (RN-3, RN-4). O Catálogo mostra o
Livro indisponível com a Cópia parada na estante.

Um erro numa execução não derruba o processo. O job registra
`resultado="erro"` e tenta de novo no próximo tique.

**Sintoma.** O painel **Job de expiração de Reservas (RN-1)** do dashboard
*Saúde da API* mostra as execuções zeradas ou só com `resultado="erro"`. Outro
sinal: Leitores relatam Livro indisponível que o balcão vê na estante.

**Verificação 1: o job está rodando?** No Prometheus, as execuções por minuto
devem ficar perto de 1:

```promql
sum(rate(biblioteca_job_execucoes_total{nome_job="expirar_reservas"}[5m])) by (resultado) * 60
```

Sem a stack `obs`, olhe o log da API. Cada falha gera
`[expireReservations] Erro ao expirar reservas` com o `err` completo.

**Verificação 2: há Reservas vencidas sem desfecho?** Esta é a consulta que
diz se o job está atrasado:

```bash
docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
SELECT count(*) AS vencidas_sem_desfecho, min("expiresAt") AS mais_antiga
FROM reservations
WHERE "expiresAt" <= now()
  AND "convertedAt" IS NULL AND "expiredAt" IS NULL AND "cancelledAt" IS NULL;
SQL
```

Com o job saudável, o resultado é `0`, ou uma contagem pequena com
`mais_antiga` de menos de um intervalo do job atrás.

**Ação.**

1. **Reinicie a API.** O job roda na subida e expira todo o atraso de uma vez
   ([§2](#o-que-acontece-na-subida-seguinte)).
2. Se o log mostrar erro repetido (banco fora, migration pendente), trate a
   causa antes: ver [§3.1](#31-api-fora-do-ar-ou-5xx-em-alta) e
   [§4](#4-banco).
3. **Só em último caso**, com a API impossibilitada de subir e Leitores
   bloqueados, aplique à mão o mesmo efeito do job, na mesma transação que
   `expireReservationsTx` usa:

   ```bash
   docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
   BEGIN;
   WITH vencidas AS (
     UPDATE reservations
        SET "expiredAt" = now(), "updatedAt" = now()
      WHERE "expiresAt" <= now()
        AND "convertedAt" IS NULL AND "expiredAt" IS NULL AND "cancelledAt" IS NULL
      RETURNING "copyId"
   )
   UPDATE copies
      SET status = 'available', "updatedAt" = now()
    WHERE id IN (SELECT "copyId" FROM vencidas)
      AND status = 'reserved';
   COMMIT;
   SQL
   ```

   Grave em `expiredAt`, **nunca** em `cancelledAt`: cancelamento é
   desistência do Leitor (RN-11), e trocar um pelo outro distorce a métrica de
   conversão do PRD §11.

**Confirmação.** A verificação 2 volta a `0`, a consulta de Disponibilidade do
[§3.6](#36-disponibilidade-divergente-entre-leitor-e-bibliotecário) não traz
linhas, e o painel do job mostra `resultado="sucesso"` perto de 1 por minuto.

---

### 3.5 Latência acima do SLO

**Alvos** (PRD, RNF-1 a RNF-4): detalhe do Livro abaixo de 300 ms; Reserva,
Empréstimo e Devolução abaixo de 3 s; listas do Leitor abaixo de 500 ms.

**Sintoma.** Um dos quatro gauges de conformidade do dashboard *Biblioteca —
SLO de Performance* sai do verde.

**Verificação.**

```promql
# RNF-1 — fração de GET /books/:id dentro de 300 ms na última hora (alvo: perto de 1)
sum(increase(http_server_request_duration_seconds_bucket{http_route="/books/:id",le="0.3"}[1h]))
  / clamp_min(sum(increase(http_server_request_duration_seconds_count{http_route="/books/:id"}[1h])), 1)

# p95 por rota — qual endpoint saiu do lugar
histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds_bucket[5m])) by (le, http_route))
```

Para RNF-2 e RNF-3, a fronteira do bucket é `le="3.0"`, não `le="3"`. Com
`le="3"` a consulta devolve *No data* em vez de erro
([`observabilidade.md` §5](../observabilidade.md#armadilha-a-fronteira-do-bucket-é-le30-não-le3)).

Depois, separe banco de aplicação. No dashboard *Saúde da API*, compare **p95
global** com **p95 do banco**, e use **p95 por operação** para achar o modelo
lento. No Jaeger, abra um trace lento da rota: o span `prisma <Modelo>.<operação>`
mostra quanto do tempo foi no banco.

**Ação.**

- **Detalhe do Livro lento e banco lento.** O RNF-1 depende do índice
  `copies(bookId, status)`. Confirme que ele existe e é usado:

  ```bash
  docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
  SELECT indexname FROM pg_indexes WHERE tablename = 'copies';
  EXPLAIN ANALYZE SELECT count(*) FROM copies
   WHERE "bookId" = (SELECT id FROM books LIMIT 1) AND status = 'available';
  SQL
  ```

  O plano deve mostrar `Index Only Scan` ou `Index Scan` em
  `copies_bookId_status_idx`. Um `Seq Scan` indica que o índice sumiu ou que as
  estatísticas estão velhas: rode `ANALYZE copies;` e confira de novo. Um índice
  ausente é defeito de migration ([§4](#4-banco)), não algo que se cria à mão.
- **Banco rápido e aplicação lenta.** Olhe os painéis **Atraso do event loop** e
  **Heap do V8** em *Runtime Node.js*. Event loop travado com heap estável indica
  trabalho síncrono pesado na rota: abra issue com o `trace_id`.
- **Tudo lento ao mesmo tempo.** Suspeite de memória do host antes do código:
  `docker stats --no-stream`.

**Confirmação.** O gauge da RNF afetada volta ao verde numa janela de 15
minutos com tráfego. Para reproduzir a carga sob controle, use
`make perf-smoke` e os cenários de [`perf/`](../../perf/README.md).

---

### 3.6 Disponibilidade divergente entre Leitor e Bibliotecário

**Por que importa.** `copies.status` é a fonte única de verdade da
Disponibilidade. O Catálogo do Leitor e a tela do balcão leem o mesmo campo, e
cada transação de Reserva, Empréstimo, cancelamento, Devolução e expiração o
atualiza junto com a linha que o justifica. Uma Cópia cujo status não bate com
suas Reservas e Empréstimos em aberto é dado inconsistente.

**Sintoma.** O balcão tem a Cópia na mão e o Catálogo diz *indisponível*; ou um
Leitor reserva uma Cópia que está emprestada.

**Verificação.** Esta consulta calcula o status que cada Cópia deveria ter e
lista só as divergentes:

```bash
docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
SELECT c.code, b.title, c.status AS atual, e.esperado
FROM copies c
JOIN books b ON b.id = c."bookId"
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM loans l
                  WHERE l."copyId" = c.id AND l."returnedAt" IS NULL) THEN 'loaned'
    WHEN EXISTS (SELECT 1 FROM reservations r
                  WHERE r."copyId" = c.id
                    AND r."convertedAt" IS NULL AND r."expiredAt" IS NULL AND r."cancelledAt" IS NULL) THEN 'reserved'
    ELSE 'available'
  END AS esperado
) e
WHERE c.status::text <> e.esperado;
SQL
```

Uma Reserva vencida e ainda não processada pelo job conta como `reserved` de
propósito: é o estado legítimo até o próximo tique. Atraso do job aparece na
verificação 2 do [§3.4](#34-job-de-expiração-parado-ou-com-erro), não aqui.

> **Em ambiente local, depois de rodar as suítes E2E, esta consulta traz
> linhas.** O helper `markReservationExpired` (`e2e/db.ts`,
> `e2e-api-rest/db.ts`) grava `expiredAt` sem liberar a Cópia, para testar a
> resposta da API sem esperar o job. Uma Reserva com `expiresAt` **anterior** a
> `createdAt` é a assinatura desse helper. `make seed` recria os dados.

**Ação.**

1. **Se há atraso do job**, trate o [§3.4](#34-job-de-expiração-parado-ou-com-erro)
   antes e rode a consulta de novo.
2. Para cada linha que sobrar, **descubra a causa antes de corrigir**. Veja o
   histórico da Cópia:

   ```bash
   docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
   SELECT c.code, c.status, c."updatedAt",
          r.id AS reserva, r."createdAt", r."expiresAt", r."convertedAt", r."expiredAt", r."cancelledAt",
          l.id AS emprestimo, l."returnedAt"
   FROM copies c
   LEFT JOIN reservations r ON r."copyId" = c.id
   LEFT JOIN loans l ON l."reservationId" = r.id
   WHERE c.code = '<código da Cópia>'
   ORDER BY r."createdAt";
   SQL
   ```

   Divergência fora do job e fora do E2E indica escrita que não passou pela
   transação do repositório: é defeito, e merece issue com esse histórico.
3. Corrija a Cópia para o status esperado numa transação que **confere a
   divergência de novo antes de escrever**, para não pisar numa Reserva feita
   no meio do caminho:

   ```bash
   docker exec -i biblioteca-postgres psql -U biblioteca -d biblioteca <<'SQL'
   BEGIN;
   UPDATE copies c
      SET status = 'available', "updatedAt" = now()
    WHERE c.code = '<código da Cópia>'
      AND c.status = 'reserved'
      AND NOT EXISTS (SELECT 1 FROM loans l WHERE l."copyId" = c.id AND l."returnedAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r."copyId" = c.id
                        AND r."convertedAt" IS NULL AND r."expiredAt" IS NULL AND r."cancelledAt" IS NULL);
   -- confira "UPDATE 1" antes do COMMIT; "UPDATE 0" significa que o estado mudou
   COMMIT;
   SQL
   ```

   O exemplo cobre o caso mais comum, `reserved` → `available`. Para os outros
   casos, troque o `SET` e o `status` atual pelo que a consulta de verificação
   mostrou, e mantenha as duas condições `EXISTS` coerentes com o status novo.

**Confirmação.** A consulta de verificação não traz linhas, e o detalhe do Livro
mostra a mesma Disponibilidade na tela do Leitor e na do Bibliotecário.

---

### 3.7 Dashboards ou logs vazios

**Sintoma.** Painéis sem dados, Graylog vazio, nenhum trace no Jaeger.

**Primeiro:** o sistema parou ou só a telemetria parou? Se `/health` responde
`200`, o produto está no ar e o incidente é só de observabilidade.

**Verificação e ação.**

```bash
make obs-status
```

A tabela de sintomas está em
[`observabilidade.md` §10 — Diagnóstico](../observabilidade.md#10-diagnóstico),
e a falha mais comum na montagem da stack (input OTel do Graylog ausente), no
[§7](../observabilidade.md#primeiro-boot-do-graylog).

**Confirmação.** `make obs-status` termina sem nenhum `✗`.

---

## 4. Banco

### Aplicar migrations

```bash
cd packages/api
npx prisma migrate status   # o que está pendente
npm run migrate:deploy      # aplica só o que está versionado em prisma/migrations/
npm run db:generate         # regenera o Prisma Client
```

- **Use sempre `migrate:deploy` fora da máquina de quem está escrevendo a
  migration.** `migrate:dev` pode propor **resetar o banco** quando detecta
  divergência, e cria migration nova a partir do schema.
- Depois de aplicar, **reinicie a API**: o Prisma Client em memória não conhece
  o schema novo.
- **Nunca edite migration já aplicada.** A correção é uma migration nova
  (ver [ADR-0002](../decisoes/0002-banco-de-dados-e-migrations.md)).

**Confirmação.** `npx prisma migrate status` termina com
`Database schema is up to date!`.

### Migration falhou no meio

**Sintoma.** `migrate:deploy` falha, e a partir daí qualquer `migrate:deploy`
responde que existe migration com falha (`P3009`). O Prisma não aplica nada
depois de uma migration marcada como falha.

**Verificação.**

```bash
cd packages/api && npx prisma migrate status
```

O comando nomeia a migration que falhou.

**Ação.** Abra o `migration.sql` da migration e confira no banco quanto dela
chegou a ser aplicado (tabelas, colunas, índices). Depois escolha **um** caminho:

| Situação | Ação |
|---|---|
| Nada, ou só uma parte, foi aplicado, e a causa foi externa (banco caiu, lock, dado incompatível já corrigido) | desfaça à mão o que foi aplicado parcialmente, marque como revertida e aplique de novo: `npx prisma migrate resolve --rolled-back <nome>` e depois `npm run migrate:deploy` |
| Tudo foi aplicado e só o registro falhou | `npx prisma migrate resolve --applied <nome>` |
| O SQL da migration está errado | **não** edite o arquivo: marque como revertida, desfaça o parcial e corrija com migration nova num PR |

`migrate resolve` só altera o registro em `_prisma_migrations`, nunca o schema:
o banco precisa estar de fato no estado que o comando declara.

**Confirmação.** `npx prisma migrate status` termina com
`Database schema is up to date!` e `/health` responde `200`.

### Comandos que apagam dados

| Comando | Apaga |
|---|---|
| `make clean` | **o volume do banco do produto** (Livros, Reservas, Empréstimos, Leitores espelhados). Preserva Keycloak e observabilidade |
| `make seed` | recria os dados de desenvolvimento por cima do banco |
| `make obs-clean` | métricas, traces e logs |
| `docker compose down -v` | **todos os volumes**, inclusive o banco do Keycloak |

Não há backup a restaurar depois de qualquer um deles.

---

## 5. Keycloak

| Tarefa | Onde está o procedimento |
|---|---|
| Criar um Bibliotecário (atribuir o papel `bibliotecario`) | [`seguranca.md` §4 — Criar um Bibliotecário](../seguranca.md#criar-um-bibliotecário) |
| Persistir mudança feita no admin console | `make keycloak-export` e depois revisar o diff de `keycloak/realm-biblioteca.json` ([`keycloak/README.md`](../../keycloak/README.md#como-mudar-o-realm)) |
| Reimportar o realm do arquivo | [`keycloak/README.md` — Como mudar o realm](../../keycloak/README.md#como-mudar-o-realm). **Apaga as contas criadas depois do import** |
| Diagnóstico de 401 | [§3.2](#32-todo-pedido-autenticado-dá-401) |

### Trocar a senha de bootstrap do admin

O Keycloak **só cria o admin de bootstrap uma vez**, na primeira subida com o
banco vazio. Mudar `KC_BOOTSTRAP_ADMIN_PASSWORD` no `.env` da raiz depois disso
não altera nada.

- **Antes da primeira subida:** troque o valor no `.env` da raiz e rode
  `make db-up`.
- **Com o Keycloak já inicializado:** entre no admin console
  (`https://localhost:8443`, realm `master`) → **Users** → `admin` →
  **Credentials** → **Reset password**, e desmarque **Temporary**. Atualize o
  `.env` para o valor novo, para quem vier depois.

**Confirmação.** O login no admin console com a senha nova funciona, e com a
antiga é recusado.

### Papel atribuído não tem efeito

O papel viaja no token. Depois de atribuir `bibliotecario`, a pessoa precisa
**sair e entrar de novo**. Enquanto o token antigo valer, a API responde `403`
nas rotas do balcão, e o painel **Negações de autorização (RN-2 / RN-7)** conta
a tentativa. O espelho local em `users` se ressincroniza no primeiro pedido com
o token novo.
