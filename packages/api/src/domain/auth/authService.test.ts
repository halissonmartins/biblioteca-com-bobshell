/**
 * packages/api/src/domain/auth/authService.test.ts
 * Testes unitários do authService — sem banco real (deps injetados como stubs).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  login,
  refresh,
  logout,
  type AuthDeps,
  type UserLookup,
  type RefreshTokenLookup,
} from './authService.js';
import { AppError } from '../../shared/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASSWORD_PLAIN = 'senha123';
const BCRYPT_COST = 4; // mínimo para testes rápidos

async function makePasswordHash(): Promise<string> {
  return bcrypt.hash(PASSWORD_PLAIN, BCRYPT_COST);
}

function makeUser(overrides?: Partial<UserLookup>): UserLookup {
  return {
    id: 'user-1',
    name: 'Ana Lima',
    email: 'leitor@biblioteca.dev',
    passwordHash: '$2a$04$placeholder', // será sobrescrito em cada teste
    role: 'leitor',
    address: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeToken(overrides?: Partial<RefreshTokenLookup>): RefreshTokenLookup {
  return {
    id: 'token-1',
    token: 'rawtoken123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    userId: 'user-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------

describe('login()', () => {
  let deps: AuthDeps;

  beforeEach(() => {
    deps = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createRefreshToken: vi.fn().mockResolvedValue({ id: 'token-1', token: 'rt' }),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      deleteRefreshTokensByUser: vi.fn(),
    };
    process.env['JWT_SECRET'] = 'test-secret-key-at-least-32-characters-long';
  });

  it('retorna accessToken, refreshToken e dados do usuário em caso de sucesso', async () => {
    const hash = await makePasswordHash();
    const user = makeUser({ passwordHash: hash });
    (deps.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await login('leitor@biblioteca.dev', PASSWORD_PLAIN, deps);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe('leitor@biblioteca.dev');
    expect(result.user.role).toBe('leitor');
    expect(deps.createRefreshToken).toHaveBeenCalledOnce();
  });

  it('lança INVALID_CREDENTIALS quando usuário não existe', async () => {
    (deps.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(login('nao@existe.com', PASSWORD_PLAIN, deps)).rejects.toThrow(
      AppError,
    );
    await expect(login('nao@existe.com', PASSWORD_PLAIN, deps)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('lança INVALID_CREDENTIALS quando senha está errada', async () => {
    const hash = await makePasswordHash();
    const user = makeUser({ passwordHash: hash });
    (deps.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    await expect(login('leitor@biblioteca.dev', 'errada', deps)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('não diferencia "usuário não existe" de "senha errada" (timing)', async () => {
    // Ambos devem lançar AppError com INVALID_CREDENTIALS
    (deps.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const err1 = await login('x@x.com', 'x', deps).catch((e: unknown) => e);

    const hash = await makePasswordHash();
    (deps.findUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUser({ passwordHash: hash }),
    );
    const err2 = await login('x@x.com', 'wrong', deps).catch((e: unknown) => e);

    expect((err1 as AppError).code).toBe('INVALID_CREDENTIALS');
    expect((err2 as AppError).code).toBe('INVALID_CREDENTIALS');
  });
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

describe('refresh()', () => {
  let deps: AuthDeps;
  const user = makeUser({ passwordHash: 'any' });
  const storedToken = makeToken();

  beforeEach(() => {
    deps = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn().mockResolvedValue(user),
      createRefreshToken: vi.fn().mockResolvedValue({ id: 'new-token', token: 'newrt' }),
      findRefreshToken: vi.fn().mockResolvedValue(storedToken),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
      deleteRefreshTokensByUser: vi.fn(),
    };
    process.env['JWT_SECRET'] = 'test-secret-key-at-least-32-characters-long';
  });

  it('retorna novo par de tokens e revoga o antigo', async () => {
    const result = await refresh('rawtoken123', deps);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(deps.revokeRefreshToken).toHaveBeenCalledWith('token-1');
    expect(deps.createRefreshToken).toHaveBeenCalledOnce();
  });

  it('lança TOKEN_INVALID quando token não existe', async () => {
    (deps.findRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(refresh('invalido', deps)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('lança TOKEN_INVALID quando token já foi revogado', async () => {
    (deps.findRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeToken({ revokedAt: new Date() }),
    );

    await expect(refresh('qualquer', deps)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('lança TOKEN_INVALID quando token está expirado', async () => {
    (deps.findRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(refresh('qualquer', deps)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe('logout()', () => {
  it('apaga todos os refresh tokens do usuário', async () => {
    const deps: AuthDeps = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createRefreshToken: vi.fn(),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      deleteRefreshTokensByUser: vi.fn().mockResolvedValue(undefined),
    };

    await logout('user-1', deps);

    expect(deps.deleteRefreshTokensByUser).toHaveBeenCalledWith('user-1');
  });
});
