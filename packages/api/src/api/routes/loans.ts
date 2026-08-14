/**
 * packages/api/src/api/routes/loans.ts
 * Rotas de Empréstimos e Devoluções.
 *
 * POST  /loans              — efetiva Empréstimo a partir de Reserva (RF-B4) — bibliotecario
 * PATCH /loans/:id/return   — registra Devolução (RF-B5)                     — bibliotecario
 * GET   /loans              — lista Empréstimos com filtro por leitor (RF-B2, RF-B3) — bibliotecario
 *
 * Autorização: authenticate + requireRole('bibliotecario') em todas.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { createLoan, returnLoan, listLoans } from '../../domain/loan/loanService.js';
import { loanRepoDeps, findLoanDetail } from '../../infra/repositories/loanRepository.js';
import { AppError } from '../../shared/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => { next(err); });
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createLoanSchema = z.object({
  reservationId: z.string().min(1, 'reservationId obrigatório'),
  dueAt: z.string().datetime({ message: 'dueAt deve ser ISO 8601 (ex: 2026-08-21T10:00:00Z)' }),
});

const listLoansQuerySchema = z.object({
  userId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /loans  — bibliotecário efetiva Empréstimo (RF-B4, RN-2, RN-6)
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticate,
  requireRole('bibliotecario'),
  asyncHandler(async (req, res, next) => {
    const parsed = createLoanSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Dados inválidos'));
      return;
    }

    const { sub: librarianId } = (req as AuthenticatedRequest).user;
    const result = await createLoan(
      {
        reservationId: parsed.data.reservationId,
        librarianId,
        dueAt: new Date(parsed.data.dueAt),
      },
      loanRepoDeps,
    );

    const loan = await findLoanDetail(result.loanId);
    res.status(201).json({ data: { loan } });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /loans/:id/return  — bibliotecário registra Devolução (RF-B5, RN-5)
// ---------------------------------------------------------------------------

router.patch(
  '/:id/return',
  authenticate,
  requireRole('bibliotecario'),
  asyncHandler(async (req, res) => {
    const { id: loanId } = req.params as { id: string };
    const { sub: librarianId } = (req as AuthenticatedRequest).user;

    await returnLoan({ loanId, librarianId }, loanRepoDeps);

    const loan = await findLoanDetail(loanId);
    res.status(200).json({ data: { loan } });
  }),
);

// ---------------------------------------------------------------------------
// GET /loans  — bibliotecário lista Empréstimos (RF-B2, RF-B3)
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requireRole('bibliotecario'),
  asyncHandler(async (req, res, next) => {
    const parsed = listLoansQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Parâmetros inválidos'));
      return;
    }

    const loans = await listLoans({ userId: parsed.data.userId }, loanRepoDeps);
    res.status(200).json({ data: loans });
  }),
);

export default router;
