/**
 * packages/api/src/api/middleware/errorHandler.ts
 * Handler global de erros do Express.
 * Deve ser registrado ÚLTIMO, após todas as rotas.
 *
 * AppError é erro esperado de negócio (RN-3 sem Cópia, RN-7 papel errado…) e
 * vira `warn`. Qualquer outra coisa é defeito: vira `error` e marca o span.
 * Antes desta mudança os AppError não deixavam rastro nenhum.
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express exige 4 parâmetros para reconhecer como error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Cast para forma opcional: o pino-http tipa `req.log` como obrigatório, mas
  // ele só existe se o middleware tiver rodado (não roda em teste unitário).
  const log: Logger = (req as { log?: Logger }).log ?? logger;
  const span = trace.getActiveSpan();

  // trace_id/span_id entram sozinhos, via mixin do instrumentation-pino.
  const contexto = {
    requestId: req.requestId ?? '-',
    metodo: req.method,
    rota: req.originalUrl,
  };

  if (err instanceof AppError) {
    span?.setAttribute('app.error_code', err.code);
    log.warn(
      { ...contexto, status: err.statusCode, code: err.code, erro: err.message },
      'requisição rejeitada',
    );
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  span?.recordException(err instanceof Error ? err : new Error(String(err)));
  span?.setStatus({ code: SpanStatusCode.ERROR, message: 'erro não tratado' });
  log.error({ ...contexto, status: 500, err }, 'erro não tratado');

  // Erro inesperado — não vazar detalhes internos em produção
  const message =
    process.env['NODE_ENV'] !== 'production' && err instanceof Error
      ? err.message
      : 'Erro interno do servidor';

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
