#!/usr/bin/env bash
#
# Cria o input OpenTelemetry (gRPC) no Graylog.
#
# Por que existe: o Graylog não aceita OTLP sem um input configurado. Sem este
# passo o pipeline de logs do Collector falha silenciosamente e o Graylog fica
# vazio — a armadilha mais comum ao montar esta stack.
#
# Idempotente: se um input com o mesmo título já existir, não faz nada.
#
# Uso:  ./observabilidade/graylog/provisionar-input.sh
#       GRAYLOG_URL=http://localhost:9001 GRAYLOG_USER=admin GRAYLOG_PASSWORD=admin

set -euo pipefail

GRAYLOG_URL="${GRAYLOG_URL:-http://localhost:9001}"
GRAYLOG_USER="${GRAYLOG_USER:-admin}"
GRAYLOG_PASSWORD="${GRAYLOG_PASSWORD:-admin}"
INPUT_TITLE="${INPUT_TITLE:-OpenTelemetry (biblioteca-api)}"
INPUT_PORT="${INPUT_PORT:-4317}"
TIMEOUT_SEGUNDOS="${TIMEOUT_SEGUNDOS:-300}"

api() {
  local metodo="$1" caminho="$2"
  shift 2
  curl -sS -u "${GRAYLOG_USER}:${GRAYLOG_PASSWORD}" \
    -H 'X-Requested-By: provisionar-input.sh' \
    -H 'Content-Type: application/json' \
    -X "${metodo}" "${GRAYLOG_URL}${caminho}" "$@"
}

# --- 0. Preflight (só no primeiro boot) ---------------------------------------
# No primeiro boot o Graylog 6.2+ sobe em modo "preflight": um assistente que
# normalmente exige cliques no navegador para criar a CA e provisionar os
# certificados do Data Node. Enquanto isso, /api/system/lbstatus não responde.
# Aqui fazemos o mesmo por API. A senha do preflight é gerada a cada boot e
# aparece no log do container.
preflight() {
  local senha
  senha="$(docker logs "${GRAYLOG_CONTAINER}" 2>&1 |
    grep -oE "password '[^']+'" | tail -1 | sed "s/password '//;s/'//")"
  if [[ -z "${senha}" ]]; then
    echo "ERRO: preflight ativo mas a senha não foi encontrada no log de ${GRAYLOG_CONTAINER}." >&2
    echo "Conclua o assistente manualmente em ${GRAYLOG_URL}." >&2
    exit 1
  fi

  local pf=(curl -sS -m 30 -u "admin:${senha}"
    -H 'X-Requested-By: provisionar-input.sh' -H 'Content-Type: application/json')

  echo "Preflight detectado — criando a CA e provisionando o Data Node..."
  "${pf[@]}" -X POST "${GRAYLOG_URL}/api/ca/create" -d '{"organization":"biblioteca"}' >/dev/null
  "${pf[@]}" -X POST "${GRAYLOG_URL}/api/renewal_policy" \
    -d '{"mode":"AUTOMATIC","certificate_lifetime":"P30D"}' >/dev/null
  "${pf[@]}" -X POST "${GRAYLOG_URL}/api/generate" -d '{}' >/dev/null
  "${pf[@]}" -X POST "${GRAYLOG_URL}/api/status/finish-config" -d '{}' >/dev/null
  echo "Preflight concluído. Aguardando o Graylog reiniciar em modo normal..."
}

GRAYLOG_CONTAINER="${GRAYLOG_CONTAINER:-biblioteca-graylog}"

if ! curl -sf -m 10 -o /dev/null "${GRAYLOG_URL}/api/system/lbstatus" 2>/dev/null &&
   curl -sf -m 10 -o /dev/null "${GRAYLOG_URL}/api/status" 2>/dev/null; then
  preflight
fi

# --- 1. Esperar o Graylog responder ------------------------------------------
# O Data Node (OpenSearch) leva alguns minutos no primeiro boot; até lá a API
# devolve 404/502.
echo "Aguardando o Graylog em ${GRAYLOG_URL} (até ${TIMEOUT_SEGUNDOS}s)..."
fim=$((SECONDS + TIMEOUT_SEGUNDOS))
until api GET /api/system/inputs >/dev/null 2>&1; do
  if ((SECONDS >= fim)); then
    echo "ERRO: Graylog não respondeu em ${TIMEOUT_SEGUNDOS}s." >&2
    exit 1
  fi
  sleep 5
done
echo "Graylog no ar."

# --- 2. Já existe? ------------------------------------------------------------
if api GET /api/system/inputs | grep -qF "\"title\":\"${INPUT_TITLE}\""; then
  echo "Input \"${INPUT_TITLE}\" já existe — nada a fazer."
  exit 0
fi

# --- 3. Descobrir o tipo do input --------------------------------------------
# O identificador da classe muda entre versões do Graylog; resolvemos em runtime
# em vez de fixar uma string que quebra no próximo upgrade.
tipo="$(
  api GET /api/system/inputs/types \
    | tr ',' '\n' \
    | grep -iE 'opentelemetry|otel' \
    | head -n1 \
    | sed -E 's/.*"(org\.graylog[^"]*)".*/\1/;s/^[{ ]*"//;s/":.*//'
)"

if [[ -z "${tipo}" ]]; then
  echo "ERRO: nenhum input OpenTelemetry disponível neste Graylog." >&2
  echo "Tipos disponíveis:" >&2
  api GET /api/system/inputs/types >&2
  exit 1
fi
echo "Tipo do input: ${tipo}"

# --- 4. Criar -----------------------------------------------------------------
# allow_insecure: sem TLS em desenvolvimento — o Collector fala em texto claro
# dentro da rede do compose (exporter otlp/graylog com tls.insecure: true).
resposta="$(
  api POST /api/system/inputs -d "$(
    cat <<JSON
{
  "title": "${INPUT_TITLE}",
  "type": "${tipo}",
  "global": true,
  "configuration": {
    "bind_address": "0.0.0.0",
    "port": ${INPUT_PORT},
    "insecure": true,
    "max_inbound_msg_size": 4194304,
    "throttling_allowed": false
  }
}
JSON
  )"
)"

echo "${resposta}"
if grep -qF '"id"' <<<"${resposta}"; then
  echo "Input \"${INPUT_TITLE}\" criado na porta ${INPUT_PORT}."
else
  echo "ERRO ao criar o input — ver resposta acima." >&2
  exit 1
fi
