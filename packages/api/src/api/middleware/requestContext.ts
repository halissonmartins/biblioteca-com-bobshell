/**
 * packages/api/src/api/middleware/requestContext.ts
 * Correlation id (X-Request-Id) e log de acesso estruturado.
 *
 * Sem AsyncLocalStorage própria: o pino-http já cria um child logger por
 * requisição (`req.log`) carregando o reqId, e o contexto de trace vem do
 * context manager que o NodeSDK registra.
 */

import { randomUUID } from 'node:crypto';

import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { HttpLogger } from 'pino-http';

import { logger } from '../../shared/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id, devolvido ao cliente no header X-Request-Id */
      requestId?: string;
    }
  }
}

const HEADER = 'x-request-id';
const TAMANHO_MAXIMO = 128;

/**
 * Reaproveita o X-Request-Id recebido (permite correlacionar com o cliente ou
 * com um proxy) ou gera um novo. O limite de tamanho evita que um header
 * arbitrariamente grande vire atributo de span e label de log.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const bruto = req.headers[HEADER];
  const recebido = Array.isArray(bruto) ? bruto[0] : bruto;
  const id =
    recebido !== undefined && recebido.length > 0 && recebido.length <= TAMANHO_MAXIMO
      ? recebido
      : randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  // Liga o id que o cliente vê ao trace: no Jaeger, busca por app.request_id.
  trace.getActiveSpan()?.setAttribute('app.request_id', id);
  next();
}

export const httpLogger: HttpLogger = pinoHttp({
  logger,
  genReqId: (req): string => (req as Request).requestId ?? randomUUID(),
  // /health é batido em laço pelo healthcheck e pelo webServer do Playwright.
  autoLogging: { ignore: (req): boolean => (req.url ?? '').startsWith('/health') },
  customLogLevel: (_req, res, err): 'error' | 'warn' | 'info' => {
    if (err !== undefined || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res): string =>
    `${req.method ?? ''} ${req.url ?? ''} ${String(res.statusCode)}`,
});
