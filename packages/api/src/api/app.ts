/**
 * packages/api/src/api/app.ts
 * Factory da aplicação Express — separado do listen() para facilitar testes.
 *
 * Importar esta função em src/index.ts (servidor) e nos testes de integração.
 */

import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../shared/errors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { httpLogger, requestId } from './middleware/requestContext.js';
import healthRouter from './routes/health.js';
import booksRouter from './routes/books.js';
import authorsRouter from './routes/authors.js';
import reservationsRouter from './routes/reservations.js';
import loansRouter from './routes/loans.js';
import meRouter from './routes/me.js';

export function createApp(): express.Application {
  const app = express();

  // ── Middlewares globais ────────────────────────────────────────────────────
  // requestId primeiro: o genReqId do httpLogger depende dele, e o header
  // precisa existir mesmo em preflight e em resposta de erro.
  app.use(requestId);
  app.use(httpLogger);
  app.use(
    cors({
      origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
      credentials: true,
      // Permite que a SPA leia o id e o mostre numa tela de erro/suporte.
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json());

  // ── Rotas ─────────────────────────────────────────────────────────────────
  // Não há rota /auth: quem emite e renova token é o Keycloak (ADR-0009). A
  // API só valida o que chega no header Authorization.
  app.use('/health', healthRouter);
  app.use('/books', booksRouter);
  app.use('/authors', authorsRouter);
  app.use('/reservations', reservationsRouter);
  app.use('/loans', loansRouter);
  app.use('/me', meRouter);

  // ── Rota sem match ────────────────────────────────────────────────────────
  // O default do Express seria HTML ("Cannot GET …"), o que quebra clientes
  // que esperam o envelope de erro JSON da casa. Passar pelo AppError mantém
  // um único formato de resposta de erro — e o log de rejeição de graça.
  app.use(
    (
      req: Request,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura de middleware exige os 3 parâmetros posicionais
      _res: Response,
      next: NextFunction,
    ): void => {
      next(new AppError('NOT_FOUND', `Rota não encontrada: ${req.method} ${req.originalUrl}`));
    },
  );

  // ── Handler global de erros (deve ser o último middleware) ────────────────
  app.use(errorHandler);

  return app;
}
