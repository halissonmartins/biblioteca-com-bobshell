# ADR-0007 — Observabilidade: OpenTelemetry e stack local

| Campo | Valor |
| --- | --- |
| Status | **Aceito** |
| Data | 15/08/2026 |

## Contexto

O backend não emitia sinal algum. Cinco `console.*` na API inteira, sem formato
estruturado, sem correlação de requisição e sem nível; o `errorHandler` não
registrava nenhum `AppError`, então um 409 de "sem Cópia disponível" (RN-3)
desaparecia sem rastro. Não havia métricas nem tracing.

Ao mesmo tempo o PRD define alvos verificáveis — RNF-1 a RNF-4 de latência e as
métricas de sucesso do §11 (conversão Reserva → Empréstimo > 70%, Reservas
expiradas < 20%) — que só existiam em execuções manuais de K6. O guia do
projeto ([E5](../guias/guia-app-web-do-zero-com-agentes.md)) já listava "logs
estruturados + correlação de requisição" como artefato obrigatório.

## Opções consideradas

| Opção | Motivo da escolha / descarte |
| --- | --- |
| **OpenTelemetry + OTLP + Collector** | **Escolhida.** Um SDK para os três sinais; o Collector isola a aplicação dos backends — trocar Jaeger por outra ferramenta é configuração, não código |
| SDK por backend (client Prometheus + logger próprio + client Jaeger) | Três bibliotecas, três formatos, três lugares para esquecer de instrumentar |
| APM comercial (Datadog, New Relic) | Custo e dependência de fornecedor num projeto que roda local; o OTel mantém a porta aberta para migrar depois |
| Só logs estruturados | Resolveria o diagnóstico, mas não responde aos alvos do PRD |

Para logs, o Graylog foi escolhido por já ter input **OpenTelemetry gRPC nativo**
desde a versão 6.2 — o sinal chega no mesmo protocolo dos outros dois, sem
adaptador.

## Decisão

**OpenTelemetry é o padrão único de instrumentação do backend.** Logs, métricas
e traces saem por OTLP/gRPC para um OTel Collector, que faz o fan-out:

```
packages/api  --OTLP gRPC-->  OTel Collector  ┬--> Jaeger      (traces)
                                              ├--> Prometheus  (métricas)  --> Grafana
                                              └--> Graylog     (logs)
```

A stack vive no perfil `obs` do `docker-compose.yml` e **não sobe** com
`docker compose up -d` — assim `make e2e`, o CI e o fluxo diário continuam leves.

### Decisões de implementação que valem registro

**Não usamos `@prisma/instrumentation`.** A versão compatível com o Prisma 5.22
deste projeto exige `@opentelemetry/instrumentation ^0.49–^0.53`, incompatível
com o SDK 0.221. Em vez disso, uma extensão de query
(`prisma.$extends({ query: { $allModels: { $allOperations } } })`) cria o span e
registra a duração. Custo aceito: não há spans internos do engine Rust (SQL real,
pool) — medimos o tempo Node → engine → Node, que é o que responde pelos SLOs.

**Instrumentações explícitas em vez de `auto-instrumentations-node`.** O Prisma
não usa `node-postgres`, então `instrumentation-pg` não captaria nada, e o
restante do pacote (aws, kafka, redis, graphql) seria peso morto no `npm ci`.

**O bootstrap do SDK é o primeiro import de `src/index.ts`.** Duas razões: as
instrumentações só conseguem instrumentar módulos ainda não carregados, e
`metrics.getMeter()` resolve o provider **no momento do import** — se
`metrics.ts` carregar antes de `sdk.start()`, todos os instrumentos viram no-op
sem erro, sem aviso e sem métrica.

## Invariantes arquiteturais (não violar)

- **`domain/` NÃO importa `@opentelemetry/api`** nem o logger. A camada de
  domínio continua pura e testável sem SDK. Métricas de resultado de caso de uso
  são emitidas em `api/routes/` e `api/middleware/`; métricas de fato persistido,
  em `infra/`.
- **Todo acesso ao banco pelos gauges passa por `infra/repositories/`** —
  `statsRepository.ts`, como qualquer outro consumidor.
- **Id de entidade nunca é atributo de métrica.** `bookId`, `userId`,
  `reservationId` são atributo de span; como label do Prometheus criariam uma
  série por valor.
- **Nenhum atributo de métrica pode se chamar `job`** — colide com o label
  reservado do exporter Prometheus e a série inteira é descartada em silêncio.
- **A observabilidade não pode quebrar a aplicação.** Collector fora do ar
  significa retry e descarte; uma coleta de gauge que falha é registrada em
  `warn` e não derruba o export das demais métricas.

## Quando revisar esta decisão

- Quando houver mais de um serviço: o Collector passa a precisar de deployment
  próprio (agente por nó ou gateway), e o sampling deixa de poder ser 100%.
- Quando o volume de traces crescer: hoje o sampling é `always_on`, o que só se
  sustenta no volume baixo previsto no PRD (poucas requisições por segundo).
- Quando houver ambiente gerenciado (ADR-0004): a stack local vira endpoint OTLP
  do provedor, e só o `OTEL_EXPORTER_OTLP_ENDPOINT` muda.
- Se o projeto migrar para Prisma 6+, reavaliar o uso de `@prisma/instrumentation`
  em lugar da extensão de query.

## Consequências

- Toda rota nova ganha span e métrica de latência **de graça**, pela
  instrumentação automática. Métrica de negócio nova continua sendo trabalho
  explícito, declarada em `infra/telemetry/metrics.ts`.
- Toda variável `OTEL_*` nova vai para `.env.example` no mesmo PR.
- Dashboards são JSON versionado em `observabilidade/grafana/dashboards/`, não
  configuração viva na interface: editar pelo Grafana não persiste.
- `make clean` deixou de usar `docker compose down -v`, que apagaria também os
  volumes do Prometheus e do Graylog. Para apagar a observabilidade existe o
  alvo separado `make obs-clean`.
- O CI não sobe a stack; a captura de dashboards fica atrás de `OBS=1`.
