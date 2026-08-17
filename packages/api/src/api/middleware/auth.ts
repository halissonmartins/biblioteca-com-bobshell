/**
 * packages/api/src/api/middleware/auth.ts
 * Middleware de autenticação (token do Keycloak) e autorização por papel.
 *
 * Uso:
 *   router.post('/loans', authenticate, requireRole('bibliotecario'), handler)
 *
 * `req.user.sub` continua sendo o id LOCAL do usuário, não o `sub` do token:
 * as FKs de Reserva e Empréstimo apontam para `users.id`, e resolver isso aqui
 * é o que mantém rotas e domínio sem saber que existe um Keycloak (ADR-0009).
 */

import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';
import { verifyAccessToken } from '../../infra/keycloak/tokenVerifier.js';
import { resolveLocalUser } from '../../domain/auth/authService.js';
import { authRepoDeps } from '../../infra/repositories/userRepository.js';
import { autenticacaoFalhas, autorizacaoNegacoes } from '../../infra/telemetry/metrics.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Espelho local já resolvido — `GET /me` o serializa sem consultar o banco de
 * novo, e `requireRole` decide sobre `role`.
 */
export interface AuthenticatedUser {
  /** id do usuário na NOSSA base (users.id) */
  sub: string;
  role: Role;
  /** `sub` do token — a conta no realm do Keycloak */
  externalId: string;
  name: string;
  email: string;
  address: string | null;
  createdAt: Date;
}

/** Request autenticado — garante que req.user está preenchido */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractToken(req: Request): string {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  throw new AppError('UNAUTHORIZED', 'Token de acesso não fornecido');
}

function motivoDaFalha(err: unknown): string {
  if (err instanceof AppError) {
    if (err.code === 'UNAUTHORIZED') return 'sem_token';
    if (err.code === 'TOKEN_EXPIRED') return 'expirado';
  }
  return 'invalido';
}

// ---------------------------------------------------------------------------
// Middleware: authenticate
// ---------------------------------------------------------------------------

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  void (async (): Promise<void> => {
    try {
      const claims = await verifyAccessToken(extractToken(req));

      // Primeiro acesso de uma conta recém-cadastrada cria o espelho local aqui.
      const user = await resolveLocalUser(
        {
          externalId: claims.sub,
          email: claims.email,
          name: claims.name,
          realmRoles: claims.realmRoles,
        },
        authRepoDeps,
      );

      (req as AuthenticatedRequest).user = {
        sub: user.id,
        role: user.role,
        externalId: user.externalId,
        name: user.name,
        email: user.email,
        address: user.address,
        createdAt: user.createdAt,
      };
      next();
    } catch (err) {
      // FORBIDDEN vem de roleFromRealmRoles (conta sem papel deste sistema) —
      // é autorização, não falha de autenticação, e não entra no contador.
      if (!(err instanceof AppError && err.code === 'FORBIDDEN')) {
        autenticacaoFalhas.add(1, { motivo: motivoDaFalha(err) });
      }

      next(
        err instanceof AppError
          ? err
          : new AppError('TOKEN_INVALID', 'Token de acesso inválido'),
      );
    }
  })();
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
