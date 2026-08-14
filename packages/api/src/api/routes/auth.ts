/**
 * packages/api/src/api/routes/auth.ts
 * Rotas de autenticação: login, refresh, logout.
 * ADR-0003: JWT em cookie httpOnly + corpo (access token).
 */

import { Router } from 'express';
import { z } from 'zod';
import cookieParser from 'cookie-parser';
import {
  login,
  refresh,
  logout,
} from '../../domain/auth/authService.js';
import * as userRepo from '../../infra/repositories/userRepository.js';
import * as tokenRepo from '../../infra/repositories/refreshTokenRepository.js';
import { AppError } from '../../shared/errors.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

/** Wraps async handler, forwarding any error to next() */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => { next(err); });
  };
}

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Cookie helpers (ADR-0003)
// ---------------------------------------------------------------------------

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
};

function setTokenCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie('access_token', accessToken, {
    ...COOKIE_OPTS,
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/auth/refresh',
  });
}

function clearTokenCookies(res: Response): void {
  res.clearCookie('access_token', COOKIE_OPTS);
  res.clearCookie('refresh_token', { ...COOKIE_OPTS, path: '/auth/refresh' });
}

// ---------------------------------------------------------------------------
// Dependências de repositório (injetadas pelo router — testáveis)
// ---------------------------------------------------------------------------

const deps = {
  findUserByEmail: userRepo.findUserByEmail,
  findUserById: userRepo.findUserById,
  createRefreshToken: tokenRepo.createRefreshToken,
  findRefreshToken: tokenRepo.findRefreshToken,
  revokeRefreshToken: tokenRepo.revokeRefreshToken,
  deleteRefreshTokensByUser: tokenRepo.deleteRefreshTokensByUser,
};

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

router.post('/login', asyncHandler(async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Dados inválidos'),
    );
    return;
  }

  const { email, password } = parsed.data;
  const result = await login(email, password, deps);

  setTokenCookies(res, result.accessToken, result.refreshToken);

  res.status(200).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
}));

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

router.post('/refresh', cookieParser(), asyncHandler(async (req, res, next) => {
  // Aceita cookie ou corpo
  const fromCookie = (req.cookies as Record<string, string | undefined>)['refresh_token'];
  const parsed = refreshSchema.safeParse(req.body);
  const rawToken = fromCookie ?? parsed.data?.refreshToken;

  if (!rawToken) {
    next(new AppError('TOKEN_INVALID', 'Refresh token não fornecido'));
    return;
  }

  const tokens = await refresh(rawToken, deps);
  setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  res.status(200).json({
    data: { accessToken: tokens.accessToken },
  });
}));

// ---------------------------------------------------------------------------
// POST /auth/logout   [requer autenticação]
// ---------------------------------------------------------------------------

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  const { sub } = (req as AuthenticatedRequest).user;
  await logout(sub, deps);
  clearTokenCookies(res);
  res.status(204).send();
}));

export default router;
