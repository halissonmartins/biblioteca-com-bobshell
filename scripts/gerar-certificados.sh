#!/usr/bin/env bash
# Gera a CA local e o par de certificados do Keycloak para https://localhost:8443.
# Fase 2 (docs/seguranca.md): sslRequired: all — token nunca mais trafega em claro,
# nem em localhost. Os arquivos ficam em keycloak/certs/ (gitignore) e o compose
# monta a pasta em /opt/keycloak/conf/certs.
#
# Uso:  ./scripts/gerar-certificados.sh          (pula se já existir)
#       FORCE=1 ./scripts/gerar-certificados.sh  (regenera)
#
# Depois de gerar, importe keycloak/certs/ca.crt na autoridade confiável do seu
# navegador/SO — só o Chromium do Playwright dispensa isso (ignoreHTTPSErrors).
set -euo pipefail

cd "$(dirname "$0")/.."
DIR=keycloak/certs
DAYS=3650

if [ -f "$DIR/tls.crt" ] && [ -z "${FORCE:-}" ]; then
  echo "✔ Certificados já existem em $DIR — pulando. Use FORCE=1 para regerar."
  exit 0
fi

mkdir -p "$DIR"

echo "→ Gerando CA local (Biblioteca Dev CA)…"
openssl req -x509 -newkey rsa:2048 -nodes -days "$DAYS" \
  -keyout "$DIR/ca.key" -out "$DIR/ca.crt" \
  -subj "/CN=Biblioteca Dev CA/O=Biblioteca" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" 2>/dev/null

echo "→ Gerando chave e certificado do servidor (SAN: localhost, 127.0.0.1)…"
openssl req -newkey rsa:2048 -nodes \
  -keyout "$DIR/tls.key" -out "$DIR/tls.csr" \
  -subj "/CN=localhost/O=Biblioteca" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -addext "extendedKeyUsage=serverAuth" 2>/dev/null

openssl x509 -req -in "$DIR/tls.csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" \
  -CAcreateserial -days "$DAYS" -out "$DIR/tls.crt" \
  -extfile <(printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n') \
  2>/dev/null

rm -f "$DIR/tls.csr" "$DIR/ca.srl"
chmod 600 "$DIR/ca.key" "$DIR/tls.key"

echo "✅ Pronto:"
echo "   $DIR/tls.crt + $DIR/tls.key  → montados no container pelo compose"
echo "   $DIR/ca.crt                  → importe no navegador/SO para confiar"
