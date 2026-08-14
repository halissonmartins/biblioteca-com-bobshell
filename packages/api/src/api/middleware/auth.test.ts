/**
 * packages/api/src/api/middleware/auth.test.ts
 * Testes unitários dos middlewares authenticate e requireRole.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole } from './auth.js';
import { AppError } from '../../shared/errors.js';
import type { AuthenticatedRequest, JwtPayload } from './auth.js';

const JWT_SECRET = 'test-secret-key-at-least-32-characters-long';

function makeReq(overrides?: Partial<Request>): Request {
  return {
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as NextFunction;
}

function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('authenticate()', () => {
  beforeEach(() => {
    process.env['JWT_SECRET'] = JWT_SECRET;
  });

  it('preenche req.user e chama next() sem erro quando token válido no header', () => {
    const token = signToken({ sub: 'user-1', role: 'leitor' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = makeNext();

    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(); // sem argumento = sem erro
    expect((req as AuthenticatedRequest).user.sub).toBe('user-1');
    expect((req as AuthenticatedRequest).user.role).toBe('leitor');
  });

  it('preenche req.user quando token está no cookie access_token', () => {
    const token = signToken({ sub: 'user-2', role: 'bibliotecario' });
    const req = makeReq({ cookies: { access_token: token } });
    const next = makeNext();

    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect((req as AuthenticatedRequest).user.role).toBe('bibliotecario');
  });

  it('chama next(AppError UNAUTHORIZED) quando sem token', () => {
    const req = makeReq();
    const next = makeNext();

    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError;
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('chama next(AppError TOKEN_INVALID) quando token mal-formado', () => {
    const req = makeReq({ headers: { authorization: 'Bearer INVALID.TOKEN' } });
    const next = makeNext();

    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError;
    expect(err.code).toBe('TOKEN_INVALID');
  });

  it('chama next(AppError TOKEN_EXPIRED) quando token expirado', () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'leitor' },
      JWT_SECRET,
      { expiresIn: -1 }, // já expirado
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = makeNext();

    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError;
    expect(err.code).toBe('TOKEN_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole()', () => {
  it('chama next() sem erro quando papel bate', () => {
    const req = makeReq() as AuthenticatedRequest;
    req.user = { sub: 'u1', role: 'bibliotecario', iat: 0, exp: 9999999999 };
    const next = makeNext();

    requireRole('bibliotecario')(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('chama next(AppError FORBIDDEN) quando papel não bate', () => {
    const req = makeReq() as AuthenticatedRequest;
    req.user = { sub: 'u1', role: 'leitor', iat: 0, exp: 9999999999 };
    const next = makeNext();

    requireRole('bibliotecario')(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError;
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
  });

  it('leitor não consegue executar ação de bibliotecario (RN-7)', () => {
    // Teste explícito do invariante RN-7
    const req = makeReq() as AuthenticatedRequest;
    req.user = { sub: 'leitor-1', role: 'leitor', iat: 0, exp: 9999999999 };
    const next = makeNext();

    requireRole('bibliotecario')(req, makeRes(), next);

    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as AppError;
    expect(err.code).toBe('FORBIDDEN');
  });
});
