/**
 * packages/api/src/shared/logger.ts
 * Logger estruturado (JSON) — único logger da aplicação, substitui os console.*.
 *
 * Fica em shared/ porque é transversal a api/ e infra/. `domain/` continua sem
 * logger: é regra de negócio pura e não emite efeito colateral (ARCHITECTURE.md).
 *
 * Correlação com traces: o @opentelemetry/instrumentation-pino injeta
 * trace_id/span_id/trace_flags automaticamente quando há span ativo, e manda o
 * mesmo registro para o Logs SDK (OTLP → Collector → Graylog). Não há nada a
 * configurar aqui além de usar o pino normalmente.
 */

import pino from 'pino';
import type { Logger } from 'pino';

const SERVICO = process.env['OTEL_SERVICE_NAME'] ?? 'biblioteca-api';
const AMBIENTE = process.env['NODE_ENV'] ?? 'development';

export const logger: Logger = pino({
  name: SERVICO,
  // Em teste o nível é 'silent': os testes existentes não devem ganhar ruído
  // em stdout por causa da observabilidade.
  level: AMBIENTE === 'test' ? 'silent' : (process.env['LOG_LEVEL'] ?? 'info'),
  base: { service: SERVICO, env: AMBIENTE, pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // 'info' em vez do numérico 30 — legível no Graylog e no log record OTLP.
    level: (label: string): Record<string, string> => ({ level: label }),
  },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
      // ADR-0009. `code` (do PKCE) NÃO entra na lista de propósito: é também o
      // nome do campo de `AppError`, e censurá-lo apagaria o código de todo
      // erro de negócio do log. O code de autorização não chega aqui — ele vai
      // do navegador direto ao token endpoint do Keycloak.
      'code_verifier',
      '*.code_verifier',
      'id_token',
      '*.id_token',
      'body.password',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});
