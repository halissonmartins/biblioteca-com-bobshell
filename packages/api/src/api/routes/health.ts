/**
 * packages/api/src/api/routes/health.ts
 * GET /health — liveness probe (sem autenticação).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../infra/prisma.js';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  // Ping rápido ao banco para confirmar conectividade
  prisma.$queryRaw`SELECT 1`.then(() => {
    res.status(200).json({ status: 'ok', db: 'ok' });
  }).catch(() => {
    res.status(503).json({ status: 'degraded', db: 'error' });
  });
});

export default router;
