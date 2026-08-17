/**
 * packages/api/src/api/middleware/auth.test.ts
 * Testes unitários dos middlewares authenticate e requireRole.
 *
 * Os tokens são assinados de verdade em RS256 (ver src/test/keycloak.ts): a
 * verificação exercitada aqui é a mesma que roda em produção — só a origem da
 * chave muda.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../infra/repositories/userRepository.js', async () => {
  const { fakeAuthRepoDeps } = await import('../../test/keycloak.js');
  return { authRepoDeps: fakeAuthRepoDeps() };
});

import { authenticate, requireRole } from './auth.js';
import { AppError } from '../../shared/errors.js';
import type { AuthenticatedRequest } from './auth.js';
import {
  emitirToken,
  instalarChavesDeTeste,
  removerChavesDeTeste,
} from '../../test/keycloak.js';

function makeReq(overrides?: Partial<Request>): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as NextFunction;
}

/** `authenticate` é assíncrono por dentro — esperar o next() ser chamado. */
async function autenticar(req: Request): Promise<ReturnType<typeof vi.fn>> {
  const next = makeNext() as ReturnType<typeof vi.fn>;
  authenticate(req, makeRes(), next as unknown as NextFunction);
  await vi.waitFor(() => {
    expect(next).toHaveBeenCalled();
  });
  return next;
}

function erroDe(next: ReturnType<typeof vi.fn>): AppError {
  return next.mock.calls[0]?.[0] as AppError;
}

function comToken(token: string): Request {
  return makeReq({ headers: { authorization: `Bearer ${token}` } });
}

beforeEach(async () => {
  await instalarChavesDeTeste();
});

afterAll(() => {
  removerChavesDeTeste();
});

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('authenticate()', () => {
  it('preenche req.user e chama next() sem erro quando o token é válido', async () => {
    const req = comToken(await emitirToken({ sub: 'user-1', realmRoles: ['leitor'] }));
    const next = await autenticar(req);

    expect(next).toHaveBeenCalledWith(); // sem argumento = sem erro
    expect((req as AuthenticatedRequest).user.sub).toBe('user-1');
    expect((req as AuthenticatedRequest).user.role).toBe('leitor');
    expect((req as AuthenticatedRequest).user.externalId).toBe('user-1');
  });

  it('resolve o papel de bibliotecario a partir de realm_access.roles', async () => {
    const req = comToken(await emitirToken({ realmRoles: ['bibliotecario'] }));
    const next = await autenticar(req);

    expect(next).toHaveBeenCalledWith();
    expect((req as AuthenticatedRequest).user.role).toBe('bibliotecario');
  });

  it('chama next(AppError UNAUTHORIZED) quando sem token', async () => {
    const next = await autenticar(makeReq());
    expect(erroDe(next).code).toBe('UNAUTHORIZED');
  });

  it('chama next(AppError TOKEN_INVALID) quando token mal-formado', async () => {
    const next = await autenticar(comToken('INVALID.TOKEN'));
    expect(erroDe(next).code).toBe('TOKEN_INVALID');
  });

  it('chama next(AppError TOKEN_EXPIRED) quando token expirado', async () => {
    const next = await autenticar(comToken(await emitirToken({ expiraEm: '-1s' })));
    expect(erroDe(next).code).toBe('TOKEN_EXPIRED');
  });

  // Os dois casos abaixo são o que a assinatura sozinha não pega: um token
  // legítimo, de outro realm ou destinado a outro serviço, continua sendo um
  // JWT bem assinado.
  it('rejeita token de outro emissor (iss)', async () => {
    const token = await emitirToken({ issuer: 'http://localhost:8081/realms/outro' });
    const next = await autenticar(comToken(token));
    expect(erroDe(next).code).toBe('TOKEN_INVALID');
  });

  it('rejeita token destinado a outra audiência (aud)', async () => {
    const next = await autenticar(comToken(await emitirToken({ audience: 'outra-api' })));
    expect(erroDe(next).code).toBe('TOKEN_INVALID');
  });

  it('rejeita conta sem papel deste sistema (403, não 401)', async () => {
    const token = await emitirToken({ realmRoles: ['offline_access'] });
    const err = erroDe(await autenticar(comToken(token)));

    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole()', () => {
  function reqComPapel(role: 'leitor' | 'bibliotecario'): AuthenticatedRequest {
    const req = makeReq() as AuthenticatedRequest;
    req.user = {
      sub: 'u1',
      role,
      externalId: 'ext-u1',
      name: 'Usuário',
      email: 'u1@biblioteca.dev',
      address: null,
      createdAt: new Date(),
    };
    return req;
  }

  it('chama next() sem erro quando papel bate', () => {
    const next = makeNext();
    requireRole('bibliotecario')(reqComPapel('bibliotecario'), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('chama next(AppError FORBIDDEN) quando papel não bate', () => {
    const next = makeNext();
    requireRole('bibliotecario')(reqComPapel('leitor'), makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = erroDe(next as ReturnType<typeof vi.fn>);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
  });

  it('leitor não consegue executar ação de bibliotecario (RN-7)', () => {
    // Teste explícito do invariante RN-7
    const next = makeNext();
    requireRole('bibliotecario')(reqComPapel('leitor'), makeRes(), next);
    expect(erroDe(next as ReturnType<typeof vi.fn>).code).toBe('FORBIDDEN');
  });
});
