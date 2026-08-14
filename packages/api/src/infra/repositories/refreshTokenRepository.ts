/**
 * packages/api/src/infra/repositories/refreshTokenRepository.ts
 * Acesso à tabela `refresh_tokens` via Prisma.
 */

import { prisma } from '../prisma.js';

export interface RefreshTokenRecord {
  id: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userId: string;
  createdAt: Date;
}

export async function createRefreshToken(data: {
  token: string;
  userId: string;
  expiresAt: Date;
}): Promise<RefreshTokenRecord> {
  return prisma.refreshToken.create({ data });
}

export async function findRefreshToken(
  token: string,
): Promise<RefreshTokenRecord | null> {
  return prisma.refreshToken.findUnique({ where: { token } });
}

/** Revoga um token (rotação — ADR-0003) */
export async function revokeRefreshToken(id: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

/** Remove todos os refresh tokens de um usuário (logout global) */
export async function deleteRefreshTokensByUser(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
