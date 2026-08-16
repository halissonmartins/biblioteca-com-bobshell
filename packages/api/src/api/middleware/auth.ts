/**
 * packages/api/src/api/middleware/auth.ts
 * Middleware de autenticação (JWT httpOnly) e autorização por papel.
 *
 * Uso:
 *   router.post('/loans', authenticate, requireRole('bibliotecario'), handler)
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';
import { autenticacaoFalhas, autorizacaoNegacoes } from '../../infra/telemetry/metrics.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface JwtPayload {
  sub: string;   // userId
  role: Role;
  iat: number;
  exp: number;
}

/** Request autenticado — garante que req.user está preenchido */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new AppError('INTERNAL_ERROR', 'JWT_SECRET não configurado');
  return secret;
}

function extractToken(req: Request): string {
  // 1. Cookie httpOnly (preferencial — ADR-0003)
  const fromCookie = (req.cookies as Record<string, string | undefined>)['access_token'];
  if (fromCookie) return fromCookie;

  // 2. Header Authorization: Bearer <token> (para testes e CLI)
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  throw new AppError('UNAUTHORIZED', 'Token de acesso não fornecido');
}

// ---------------------------------------------------------------------------
// Middleware: authenticate
// ---------------------------------------------------------------------------

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);
    const payload = jwt.verify(token, getSecret()) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      autenticacaoFalhas.add(1, { motivo: 'sem_token' });
      next(err);
      return;
    }
    if (err instanceof jwt.TokenExpiredError) {
      autenticacaoFalhas.add(1, { motivo: 'expirado' });
      next(new AppError('TOKEN_EXPIRED', 'Token de acesso expirado'));
      return;
    }
    autenticacaoFalhas.add(1, { motivo: 'invalido' });
    next(new AppError('TOKEN_INVALID', 'Token de acesso inválido'));
  }
}

// ---------------------------------------------------------------------------
// Middleware: requireRole
// ---------------------------------------------------------------------------

export function requireRole(role: Role) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;
    if (user.role !== role) {
      // RN-2/RN-7: ação de balcão tentada por quem não é Bibliotecário.
      autorizacaoNegacoes.add(1, { papel_requerido: role, papel_usuario: user.role });
      next(
        new AppError(
          'FORBIDDEN',
          `Ação restrita a ${role}. Seu papel: ${user.role}`,
        ),
      );
      return;
    }
    next();
  };
}
