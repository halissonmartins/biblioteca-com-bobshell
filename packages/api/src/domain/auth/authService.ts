/**
 * packages/api/src/domain/auth/authService.ts
 * Lógica pura de autenticação — sem HTTP, sem cookies, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Papéis possíveis: 'leitor' | 'bibliotecario' (RN-7, ADR-0003)
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import type { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AuthDeps {
  findUserByEmail: (email: string) => Promise<UserLookup | null>;
  findUserById: (id: string) => Promise<UserLookup | null>;
  createRefreshToken: (data: {
    token: string;
    userId: string;
    expiresAt: Date;
  }) => Promise<{ id: string; token: string }>;
  findRefreshToken: (token: string) => Promise<RefreshTokenLookup | null>;
  revokeRefreshToken: (id: string) => Promise<void>;
  deleteRefreshTokensByUser: (userId: string) => Promise<void>;
}

export interface UserLookup {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  address: string | null;
  createdAt: Date;
}

export interface RefreshTokenLookup {
  id: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    address: string | null;
    createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function jwtSecret(): string {
  const s = process.env['JWT_SECRET'];
  if (!s) throw new AppError('INTERNAL_ERROR', 'JWT_SECRET não configurado');
  return s;
}

function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, jwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function generateRefreshToken(): string {
  return randomBytes(40).toString('hex');
}

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string,
  deps: AuthDeps,
): Promise<LoginResult> {
  const user = await deps.findUserByEmail(email);

  // Não diferenciar "usuário não existe" de "senha errada" (timing-safe)
  const dummyHash = '$2a$12$invalido.invalido.invalido.invalido.invalido.invali';
  const hash = user?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
  }

  const accessToken = signAccessToken(user.id, user.role);
  const rawRefresh = generateRefreshToken();

  await deps.createRefreshToken({
    token: rawRefresh,
    userId: user.id,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken,
    refreshToken: rawRefresh,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      address: user.address,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

export async function refresh(
  rawRefreshToken: string,
  deps: AuthDeps,
): Promise<TokenPair> {
  const stored = await deps.findRefreshToken(rawRefreshToken);

  if (
    !stored ||
    stored.revokedAt !== null ||
    stored.expiresAt < new Date()
  ) {
    throw new AppError('TOKEN_INVALID', 'Refresh token inválido ou expirado');
  }

  const user = await deps.findUserById(stored.userId);
  if (!user) {
    throw new AppError('TOKEN_INVALID', 'Usuário do token não encontrado');
  }

  // Rotação: revogar o antigo, criar novo
  await deps.revokeRefreshToken(stored.id);

  const newRefresh = generateRefreshToken();
  await deps.createRefreshToken({
    token: newRefresh,
    userId: user.id,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: newRefresh,
  };
}

export async function logout(
  userId: string,
  deps: AuthDeps,
): Promise<void> {
  await deps.deleteRefreshTokensByUser(userId);
}
