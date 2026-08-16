/**
 * packages/api/src/api/routes/books.ts
 * Rotas do Catálogo de Livros.
 *
 * GET  /books          — lista paginada (RF-L1, US-01)  — público
 * GET  /books/:id      — detalhes de um Livro (RF-L2, US-02)  — público
 *
 * Ambas são públicas (sem autenticação): leitores não autenticados devem
 * poder navegar o catálogo (PRD §5.1, RF-L1, RF-L2).
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { listBooks, getBook } from '../../domain/book/bookService.js';
import * as bookRepo from '../../infra/repositories/bookRepository.js';
import { catalogoBuscas, catalogoResultados } from '../../infra/telemetry/metrics.js';
import { AppError } from '../../shared/errors.js';

const router = Router();

/** Wraps async handler, forwarding any error to next() */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => { next(err); });
  };
}

// Repositório injetado nas deps do serviço
const deps = {
  findBooks: bookRepo.findBooks,
  findBookById: bookRepo.findBookById,
  // findAuthorBySlug não usado neste router
  findAuthorBySlug: (): Promise<null> => Promise.resolve(null),
};

// ---------------------------------------------------------------------------
// Schemas de query
// ---------------------------------------------------------------------------

const listBooksQuerySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

// ---------------------------------------------------------------------------
// GET /books
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    const parsed = listBooksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(
        new AppError(
          'VALIDATION_ERROR',
          parsed.error.errors[0]?.message ?? 'Parâmetros inválidos',
        ),
      );
      return;
    }

    const result = await listBooks(parsed.data, deps);

    // Só contamos buscas de fato — a navegação paginada do catálogo sem termo
    // não é uma busca e distorceria a taxa de resultado vazio.
    if (parsed.data.search !== undefined) {
      const atributos = { busca_vazia: result.pagination.total === 0 };
      catalogoBuscas.add(1, atributos);
      catalogoResultados.record(result.pagination.total, atributos);
    }

    res.status(200).json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// GET /books/:id
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const book = await getBook(id, deps);
    res.status(200).json({ data: book });
  }),
);

export default router;
