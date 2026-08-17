/**
 * packages/api/src/infra/repositories/userRepository.ts
 * ÚNICO ponto de acesso à tabela `users` via Prisma.
 * Sem regras de negócio — apenas leitura/escrita de dados.
 *
 * `users` é o espelho local da identidade do Keycloak (ADR-0009): a senha não
 * mora aqui, e `externalId` é o `sub` do token que liga as duas pontas.
 */

import type { Role } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthDeps, UserLookup } from '../../domain/auth/authService.js';

export type UserRecord = UserLookup;

export async function findUserByExternalId(
  externalId: string,
): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { externalId } });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(data: {
  externalId: string;
  name: string;
  email: string;
  role: Role;
}): Promise<UserRecord> {
  return prisma.user.create({ data });
}

export async function updateUserProfile(
  id: string,
  data: { name: string; email: string; role: Role },
): Promise<UserRecord> {
  return prisma.user.update({ where: { id }, data });
}

/** Dependências do authService, prontas para o middleware injetar. */
export const authRepoDeps: AuthDeps = {
  findUserByExternalId,
  createUser,
  updateUserProfile,
};
