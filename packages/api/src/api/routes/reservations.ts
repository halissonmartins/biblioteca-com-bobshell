/**
 * packages/api/src/api/routes/reservations.ts
 * Rotas de Reservas.
 *
 * POST /reservations   — cria Reserva (RF-L3, RN-3, RN-4)         — leitor
 * GET  /reservations   — lista todas as Reservas (RF-B1, RF-B3)   — bibliotecario
 *
 * Autorização:
 *   - POST: authenticate + requireRole('leitor')
 *   - GET:  authenticate + requireRole('bibliotecario')
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { createReservation, listBookReservations } from '../../domain/reservation/reservationService.js';
import {
  reservationRepoDeps,
  findReservationDetail,
  findAllReservations,
} from '../../infra/repositories/reservationRepository.js';
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

const createReservationSchema = z.object({
  bookId: z.string().min(1, 'bookId obrigatório'),
});

const listReservationsQuerySchema = z.object({
  userId: z.string().optional(),
  bookId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /reservations  — leitor cria Reserva (RF-L3)
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticate,
  requireRole('leitor'),
  asyncHandler(async (req, res, next) => {
    const parsed = createReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Dados inválidos'));
      return;
    }

    const { sub: userId } = (req as AuthenticatedRequest).user;
    const result = await createReservation(
      { userId, bookId: parsed.data.bookId },
      reservationRepoDeps,
    );

    const reservation = await findReservationDetail(result.reservationId);
    res.status(201).json({ data: { reservation } });
  }),
);

// ---------------------------------------------------------------------------
// GET /reservations  — bibliotecário lista Reservas (RF-B1, RF-B3)
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requireRole('bibliotecario'),
  asyncHandler(async (req, res, next) => {
    const parsed = listReservationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Parâmetros inválidos'));
      return;
    }

    let reservations;
    if (parsed.data.bookId) {
      // Filtro por livro (RF-B1)
      reservations = await listBookReservations(
        { bookId: parsed.data.bookId },
        reservationRepoDeps,
      );
    } else {
      // Todas, opcionalmente filtradas por leitor (RF-B3)
      reservations = await findAllReservations(parsed.data.userId);
    }

    res.status(200).json({ data: reservations });
  }),
);

export default router;
