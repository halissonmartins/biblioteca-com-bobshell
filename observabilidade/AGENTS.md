# AGENTS.md — stack de observabilidade

Complementa o [`AGENTS.md`](../AGENTS.md) da raiz. Vale para tudo dentro de
`observabilidade/`.

A referência completa é [`docs/observabilidade.md`](../docs/observabilidade.md) —
**leia antes de mexer aqui**. Este arquivo é o resumo operacional de quem edita
estes arquivos de configuração.

## O que esta pasta é

A configuração dos sete contêineres do perfil `obs` do `docker-compose.yml`
(Collector, Prometheus, Grafana, Jaeger, Graylog, Graylog Data Node e MongoDB).
Eles **não** sobem com `docker compose up -d`; sobem com `make obs-up`.

| Caminho | Peça |
|---|---|
| `otel-collector/config.yaml` | Recebe OTLP da API e faz o fan-out dos três sinais |
| `prometheus/prometheus.yml` | Raspa o Collector — nunca a API |
| `grafana/dashboards/*.json` | Os dashboards, fonte de verdade |
| `grafana/provisioning/` | Datasources e provider de dashboards, por arquivo |
| `graylog/provisionar-input.sh` | Cria o input OTLP sem o qual o Graylog fica vazio |
| `verificar.sh` | `make obs-status` — checa o pipeline com comandos, não com o olho |

O caminho é sempre **API → Collector → destino**. A API só fala OTLP; nada raspa a
API diretamente, e nada exporta para Jaeger, Prometheus ou Graylog sem passar pelo
Collector.

## Dashboard novo

1. JSON versionado em `grafana/dashboards/<uid>.json`, com `uid` **igual ao nome do
   arquivo**
2. Registrar o `uid` em [`../e2e/dashboards.spec.ts`](../e2e/dashboards.spec.ts)
3. Documentar nas **duas** seções de `docs/observabilidade.md`: §6 (descritiva) e §9
   (com o screenshot)
4. `make obs-dashboards` para capturar o PNG em `assets/images/dashboards/`

Vindo do marketplace da Grafana, o campo `description` do JSON grava a procedência
(número, título, revisão, licença) e o que foi adaptado.

**Editar pela interface do Grafana não persiste.** O provider está com
`allowUiUpdates: false` e recarrega do disco a cada 30 s. Use a UI para experimentar,
depois traga a mudança para o JSON.

## Três armadilhas que já custaram dashboard vazio

**Atributo de métrica não pode se chamar `job`.** O exporter Prometheus do Collector
já usa `job` como label, derivado de `service.name`. Uma métrica com atributo `job` é
descartada **inteira**, e nada aparece do lado da aplicação — o erro fica só no log do
Collector (`duplicate label names in constant and variable labels`). Por isso o
atributo do job de expiração se chama `nome_job`.

**A fronteira do bucket é `le="3.0"`, não `le="3"`.** O exporter renderiza as
fronteiras como float. `0.3` e `0.5` casam como escritos, `3` não — e uma consulta com
`le="3"` devolve **No data**, não erro.

**`OTEL_SEMCONV_STABILITY_OPT_IN=http` é obrigatória.** Sem ela a instrumentação emite
a semântica antiga (`http.server.duration`, em milissegundos) e toda a PromQL dos
dashboards, que assume `http_server_request_duration_seconds_*`, fica vazia. É também
o que permite usar dashboard de terceiro sem reescrever query (ADR-0007).

## Não desfaça sem ler o porquê

- **`resource_to_telemetry_conversion` desligado** no exporter Prometheus: ligado, ele
  promove todo resource attribute a label — inclusive `process.pid`, que muda a cada
  reload do `tsx watch` e criaria uma série nova por reinício
- **Fronteiras de bucket customizadas** (`0,3 · 0,5 · 3` s): são exatamente os alvos de
  RNF-1, RNF-4 e RNF-2/3, e é isso que torna "% dentro do alvo" uma razão exata de
  buckets em vez de interpolação. Os defaults do OTel pulam de `0,25` para `0,5`
- **`memory_limiter` como primeiro processor**: rejeita dados quando a memória aperta,
  em vez de deixar o container ser morto pelo `mem_limit`
- **`mem_limit` de cada serviço**: a stack roda em WSL2 com 6 GB. O Jaeger tem `1g`
  porque guarda traces em memória sem volume — com 512 MB o kernel matava o processo
  sob carga K6 e levava o histórico junto, sem deixar nada no log do container

## Rodar e verificar

```bash
make obs-up          # sobe a stack e provisiona o input do Graylog
make obs-status      # ./verificar.sh — a checagem de verdade
make obs-logs        # segue o log do Collector
make obs-dashboards  # recaptura os screenshots
make obs-down        # para preservando os dados
make obs-clean       # para e APAGA métricas, traces e logs
```

Durante validação use `make dev-api`, não `make dev`: o Vite não é necessário para
gerar carga nem para capturar dashboard, e sobra memória. Para popular os painéis
antes de capturar, use a carga K6 de [`../perf/`](../perf/README.md).

`obs-status` é o critério — sem ele, "está funcionando" é inspeção visual. Ele checa
serviço no ar, sinais recebidos pelo Collector e falhas de export **crescendo** (um
acumulado maior que zero é normal: o Collector tenta exportar antes de Jaeger e
Graylog terminarem de subir).

## Shell

`verificar.sh` e `provisionar-input.sh` passam limpos no `shellcheck` — mantenha
assim. Ambos são idempotentes e aceitam sobrescrita por variável de ambiente
(`GRAYLOG_URL`, `GRAYLOG_USER`, `GRAYLOG_PASSWORD`).
