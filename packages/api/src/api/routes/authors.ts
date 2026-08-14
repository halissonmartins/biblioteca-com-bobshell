/**
 * packages/api/src/api/routes/authors.ts
 * Rotas de Autores.
 *
 * GET  /authors/:slug  — página do Autor com lista de Livros (RF-L6, US-06)  — público
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getAuthor } from '../../domain/book/bookService.js';
import * as authorRepo from '../../infra/repositories/authorRepository.js';

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
  // findBooks e findBookById não usados neste router
  findBooks: (): Promise<{ books: never[]; total: number }> => Promise.resolve({ books: [], total: 0 }),
  findBookById: (): Promise<null> => Promise.resolve(null),
  findAuthorBySlug: authorRepo.findAuthorBySlug,
};

// ---------------------------------------------------------------------------
// GET /authors/:slug
// ---------------------------------------------------------------------------

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params as { slug: string };
    const author = await getAuthor(slug, deps);
    res.status(200).json({ data: author });
  }),
);

export default router;
