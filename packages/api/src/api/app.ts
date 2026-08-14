/**
 * packages/api/src/api/app.ts
 * Factory da aplicação Express — separado do listen() para facilitar testes.
 *
 * Importar esta função em src/index.ts (servidor) e nos testes de integração.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import booksRouter from './routes/books.js';
import authorsRouter from './routes/authors.js';
import reservationsRouter from './routes/reservations.js';
import loansRouter from './routes/loans.js';
import meRouter from './routes/me.js';

export function createApp(): express.Application {
  const app = express();

  // ── Middlewares globais ────────────────────────────────────────────────────
  app.use(
    cors({
      origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  // ── Rotas ─────────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/books', booksRouter);
  app.use('/authors', authorsRouter);
  app.use('/reservations', reservationsRouter);
  app.use('/loans', loansRouter);
  app.use('/me', meRouter);

  // ── Handler global de erros (deve ser o último middleware) ────────────────
  app.use(errorHandler);

  return app;
}
