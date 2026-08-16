#!/usr/bin/env bash
#
# Verifica o pipeline de observabilidade de ponta a ponta.
#
# Cada checagem é um comando com resposta objetiva — não uma inspeção visual.
# Uso: make obs-status   (ou ./observabilidade/verificar.sh)

set -uo pipefail

GRAYLOG_USER="${GRAYLOG_USER:-admin}"
GRAYLOG_PASSWORD="${GRAYLOG_PASSWORD:-admin}"

falhas=0

ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
falha() { printf '  \033[31m✗\033[0m %s\n' "$1"; falhas=$((falhas + 1)); }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# --- 1. Serviços no ar --------------------------------------------------------
titulo "1. Serviços"
for s in "OTel Collector|http://localhost:13133" \
         "Prometheus|http://localhost:9090/-/ready" \
         "Grafana|http://localhost:3001/api/health" \
         "Jaeger|http://localhost:16686/api/services" \
         "Graylog|http://localhost:9001/api/system/lbstatus"; do
  nome="${s%%|*}"; url="${s##*|}"
  if curl -sf -m 10 -o /dev/null "${url}"; then ok "${nome}"; else falha "${nome} não responde (${url})"; fi
done

# --- 2. Collector recebendo os três sinais -----------------------------------
titulo "2. OTel Collector — sinais recebidos"
soma_metrica() { # $1 = prefixo da métrica, $2 = corpo do /metrics
  awk -v m="$1" 'index($0, m) == 1 { s += $NF } END { print s + 0 }' <<<"$2"
}

metricas="$(curl -sf -m 10 http://localhost:8888/metrics || true)"
for par in "spans|otelcol_receiver_accepted_spans" \
           "métricas|otelcol_receiver_accepted_metric_points" \
           "logs|otelcol_receiver_accepted_log_records"; do
  rotulo="${par%%|*}"; metrica="${par##*|}"
  total="$(soma_metrica "${metrica}" "${metricas}")"
  if ((total > 0)); then
    ok "${rotulo}: ${total} recebidos"
  else
    falha "${rotulo}: nenhum recebido — a API exportou algo? (make dev-api + gerar tráfego)"
  fi
done

titulo "3. OTel Collector — falhas de export"
# Compara duas amostras: o que importa é se as falhas estão CRESCENDO. Um total
# acumulado > 0 é normal — o Collector tenta exportar antes de o Jaeger e o
# Graylog terminarem de subir, e essas primeiras tentativas ficam no contador.
sleep 10
metricas2="$(curl -sf -m 10 http://localhost:8888/metrics || true)"
for exp in otlp/jaeger otlp/graylog prometheus; do
  antes="$(soma_metrica "otelcol_exporter_send_failed" "$(grep "exporter=\"${exp}\"" <<<"${metricas}")")"
  depois="$(soma_metrica "otelcol_exporter_send_failed" "$(grep "exporter=\"${exp}\"" <<<"${metricas2}")")"
  if ((depois <= antes)); then
    ok "${exp}: estável (acumulado histórico: ${depois})"
  else
    falha "${exp}: falhas crescendo (${antes} → ${depois}) — telemetria sendo perdida agora"
  fi
done

# --- 4. Jaeger ----------------------------------------------------------------
titulo "4. Jaeger — traces"
servicos="$(curl -sf -m 10 http://localhost:16686/api/services || true)"
if grep -q 'biblioteca-api' <<<"${servicos}"; then
  ok "serviço biblioteca-api registrado"
else
  falha "serviço biblioteca-api ausente (serviços: ${servicos})"
fi

# --- 5. Graylog ---------------------------------------------------------------
titulo "5. Graylog — logs"
inputs="$(curl -sf -m 15 -u "${GRAYLOG_USER}:${GRAYLOG_PASSWORD}" http://localhost:9001/api/system/inputs || true)"
if grep -qi 'opentelemetry\|otel' <<<"${inputs}"; then
  ok "input OpenTelemetry configurado"
else
  falha "input OpenTelemetry ausente — rode ./observabilidade/graylog/provisionar-input.sh"
fi

# Accept: application/json é obrigatório — sem ele a busca do Graylog responde CSV.
busca="$(curl -sf -m 20 -u "${GRAYLOG_USER}:${GRAYLOG_PASSWORD}" \
  -H 'X-Requested-By: verificar.sh' -H 'Accept: application/json' \
  'http://localhost:9001/api/search/universal/relative?query=*&range=900&limit=1&fields=message,otel_trace_id' || true)"
encontradas="$(sed -nE 's/.*"total_results":([0-9]+).*/\1/p' <<<"${busca}")"
if [[ -n "${encontradas}" ]] && ((encontradas > 0)); then
  ok "${encontradas} mensagem(ns) indexada(s) nos últimos 15 min"
else
  falha "nenhuma mensagem indexada nos últimos 15 min"
fi

if grep -q 'otel_trace_id' <<<"${busca}"; then
  ok "logs correlacionados com traces (otel_trace_id presente)"
else
  falha "logs sem otel_trace_id — correlação log ↔ trace quebrada"
fi

# --- 6. Prometheus ------------------------------------------------------------
titulo "6. Prometheus — métricas customizadas"
# Consulta cada métrica de verdade em vez de listar __name__: a lista de nomes
# tem janela própria e devolve falso negativo para métrica emitida há pouco.
esperadas=(
  biblioteca_reservas_criadas_total
  biblioteca_reservas_expiradas_total
  biblioteca_emprestimos_efetivados_total
  biblioteca_devolucoes_total
  biblioteca_reserva_conversao_duracao_seconds_count
  biblioteca_catalogo_buscas_total
  biblioteca_catalogo_resultados_count
  biblioteca_autorizacao_negacoes_total
  biblioteca_autenticacao_falhas_total
  biblioteca_logins_total
  biblioteca_reservas_ativas
  biblioteca_emprestimos_ativos
  biblioteca_emprestimos_vencidos
  biblioteca_copias
  biblioteca_job_execucoes_total
  biblioteca_job_duracao_seconds_count
  db_client_operation_duration_seconds_count
  http_server_request_duration_seconds_count
)
for m in "${esperadas[@]}"; do
  resposta="$(curl -sf -m 10 --get 'http://localhost:9090/api/v1/query' --data-urlencode "query=${m}" || true)"
  if grep -q '"result":\[{' <<<"${resposta}"; then ok "${m}"; else falha "${m} sem série no Prometheus"; fi
done

# --- 7. Grafana ---------------------------------------------------------------
titulo "7. Grafana"
if curl -sf -m 10 http://localhost:3001/api/datasources | grep -q '"type":"prometheus"'; then
  ok "datasource Prometheus provisionado"
else
  falha "datasource Prometheus ausente"
fi

dashboards="$(curl -sf -m 10 'http://localhost:3001/api/search?type=dash-db' || true)"
for uid in biblioteca-negocio biblioteca-slo biblioteca-saude-api; do
  if grep -q "\"${uid}\"" <<<"${dashboards}"; then ok "dashboard ${uid}"; else falha "dashboard ${uid} ausente"; fi
done

# --- Resultado ----------------------------------------------------------------
printf '\n'
if ((falhas == 0)); then
  printf '\033[32m✅ Pipeline de observabilidade íntegro.\033[0m\n'
else
  printf '\033[31m❌ %d verificação(ões) falharam.\033[0m\n' "${falhas}"
fi
exit "$((falhas > 0 ? 1 : 0))"
