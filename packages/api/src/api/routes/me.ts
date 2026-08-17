/**
 * packages/api/src/api/routes/me.ts
 * Rotas do perfil do usuário autenticado.
 *
 * GET /me               — perfil local de quem está autenticado — qualquer papel
 * GET /me/reservations  — lista Reservas ativas do Leitor (RF-L4) — leitor
 * GET /me/loans         — lista Empréstimos do Leitor (RF-L5)     — leitor
 *
 * Autorização: authenticate em todas; requireRole('leitor') nas duas últimas.
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
// GET /me  — perfil local de quem está autenticado
//
// É como a SPA e os testes descobrem o id LOCAL depois de autenticar no
// Keycloak, e é a prova observável de que o espelho local foi criado no
// primeiro acesso (ADR-0009). Sem requireRole: Leitor e Bibliotecário leem o
// próprio perfil.
//
// Não consulta o banco: `authenticate` já resolveu o registro.
// ---------------------------------------------------------------------------

router.get('/', authenticate, (req, res) => {
  const user = (req as AuthenticatedRequest).user;
  res.status(200).json({
    data: {
      id: user.sub,
      name: user.name,
      email: user.email,
      role: user.role,
      address: user.address,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

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
