/**
 * packages/api/src/api/routes/me.ts
 * Rotas do perfil do Leitor autenticado.
 *
 * GET /me/reservations  — lista Reservas ativas do Leitor (RF-L4) — leitor
 * GET /me/loans         — lista Empréstimos do Leitor (RF-L5)     — leitor
 *
 * Autorização: authenticate + requireRole('leitor') em ambas.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { listReaderReservations } from '../../domain/reservation/reservationService.js';
import { listLoans } from '../../domain/loan/loanService.js';
import { reservationRepoDeps } from '../../infra/repositories/reservationRepository.js';
import { loanRepoDeps } from '../../infra/repositories/loanRepository.js';
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
// GET /me/reservations  — Reservas ativas do Leitor (RF-L4)
// ---------------------------------------------------------------------------

router.get(
  '/reservations',
  authenticate,
  requireRole('leitor'),
  asyncHandler(async (req, res) => {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const reservations = await listReaderReservations({ userId }, reservationRepoDeps);
    res.status(200).json({ data: reservations });
  }),
);

// ---------------------------------------------------------------------------
// GET /me/loans  — Empréstimos do Leitor autenticado (RF-L5)
// ---------------------------------------------------------------------------

router.get(
  '/loans',
  authenticate,
  requireRole('leitor'),
  asyncHandler(async (req, res) => {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const loans = await listLoans({ userId }, loanRepoDeps);
    res.status(200).json({ data: loans });
  }),
);

export default router;
