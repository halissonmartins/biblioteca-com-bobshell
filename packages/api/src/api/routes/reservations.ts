/**
 * packages/api/src/api/routes/reservations.ts
 * Rotas de Reservas.
 *
 * POST  /reservations             — cria Reserva (RF-L3, RN-3, RN-4)        — leitor
 * PATCH /reservations/:id/cancel  — Leitor desiste da Reserva (RF-L8, RN-11) — leitor
 * GET   /reservations             — lista todas as Reservas (RF-B1, RF-B3)   — bibliotecario
 *
 * Autorização:
 *   - POST e PATCH: authenticate + requireRole('leitor')
 *   - GET:          authenticate + requireRole('bibliotecario')
 *
 * O papel não basta no PATCH: RN-11 diz que só o dono cancela, e a propriedade é
 * decidida no domínio comparando o `sub` do token com o `userId` da Reserva.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
  cancelReservation,
  createReservation,
  listBookReservations,
} from '../../domain/reservation/reservationService.js';
import {
  reservationRepoDeps,
  findReservationDetail,
  findAllReservations,
} from '../../infra/repositories/reservationRepository.js';
import { AppError } from '../../shared/errors.js';
import { reservasCanceladas, reservasCriadas } from '../../infra/telemetry/metrics.js';
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

/**
 * Traduz a recusa em valor do atributo `resultado` da métrica.
 *
 * Separar `sem_copia` de `duplicada` e `limite` é o que permite ler no painel se
 * a Reserva não saiu porque o acervo acabou (sinal de compra) ou porque a regra
 * barrou o Leitor (sinal de uso) — duas conclusões opostas sob o mesmo 409.
 */
function resultadoDaFalha(err: unknown): string {
  if (!(err instanceof AppError)) return 'erro';
  switch (err.code) {
    case 'NO_COPY_AVAILABLE':          return 'sem_copia';           // RN-3
    case 'DUPLICATE_RESERVATION':      return 'duplicada';           // RN-9
    case 'RESERVATION_LIMIT_REACHED':  return 'limite';              // RN-10
    default:                           return 'erro';
  }
}

/**
 * Traduz a recusa do cancelamento em valor do atributo `resultado`.
 *
 * `expirada` é o valor que mais interessa: é o Leitor tentando cancelar o que o
 * prazo já encerrou — sinal de que a tela deixou o botão à mostra depois da hora,
 * não de que ele fez algo errado.
 */
function resultadoDoCancelamento(err: unknown): string {
  if (!(err instanceof AppError)) return 'erro';
  switch (err.code) {
    case 'NOT_FOUND':           return 'nao_encontrada';   // não existe, ou não é dele (RN-11)
    case 'RESERVATION_EXPIRED': return 'expirada';         // RN-1 chegou primeiro
    case 'CONFLICT':            return 'encerrada';        // convertida, ou já cancelada
    default:                    return 'erro';
  }
}

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

    // A métrica fica aqui, e não no domínio, porque `domain/` é regra de
    // negócio pura e não emite efeito colateral (ARCHITECTURE.md). O erro é
    // re-lançado: o contrato da rota não muda.
    let result;
    try {
      result = await createReservation({ userId, bookId: parsed.data.bookId }, reservationRepoDeps);
      reservasCriadas.add(1, { resultado: 'criada' });
    } catch (err) {
      reservasCriadas.add(1, { resultado: resultadoDaFalha(err) });
      throw err;
    }

    const reservation = await findReservationDetail(result.reservationId);
    res.status(201).json({ data: { reservation } });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /reservations/:id/cancel  — leitor desiste da Reserva (RF-L8, RN-11)
// ---------------------------------------------------------------------------

router.patch(
  '/:id/cancel',
  authenticate,
  requireRole('leitor'),
  asyncHandler(async (req, res) => {
    // O id vem da rota e o Leitor vem do token — nunca do corpo (ADR-0009). Não
    // há schema de corpo a validar: cancelar não tem parâmetro.
    const { id: reservationId } = req.params as { id: string };
    const { sub: userId } = (req as AuthenticatedRequest).user;

    // Métrica na borda, como em POST: `domain/` não emite telemetria (ADR-0007).
    try {
      await cancelReservation({ reservationId, userId }, reservationRepoDeps);
      reservasCanceladas.add(1, { resultado: 'cancelada' });
    } catch (err) {
      reservasCanceladas.add(1, { resultado: resultadoDoCancelamento(err) });
      throw err;
    }

    // Devolve a Reserva encerrada, não 204: a tela precisa do `status` e do
    // `cancelledAt` para trocar a linha sem esperar o refetch da lista.
    const reservation = await findReservationDetail(reservationId);
    res.status(200).json({ data: { reservation } });
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
