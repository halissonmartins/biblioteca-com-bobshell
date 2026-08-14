/**
 * packages/api/src/infra/repositories/userRepository.ts
 * ÚNICO ponto de acesso à tabela `users` via Prisma.
 * Sem regras de negócio — apenas leitura/escrita de dados.
 */

import { prisma } from '../prisma.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'leitor' | 'bibliotecario';
  address: string | null;
  createdAt: Date;
}

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}
