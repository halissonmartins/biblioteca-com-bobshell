/**
 * packages/api/src/api/middleware/errorHandler.ts
 * Handler global de erros do Express.
 * Deve ser registrado ÚLTIMO, após todas as rotas.
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express exige 4 parâmetros para reconhecer como error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Erro inesperado — não vazar detalhes internos em produção
  const message =
    process.env['NODE_ENV'] !== 'production' && err instanceof Error
      ? err.message
      : 'Erro interno do servidor';

  console.error('[errorHandler] erro não tratado:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
