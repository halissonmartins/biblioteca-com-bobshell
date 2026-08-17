/**
 * packages/api/src/domain/auth/authService.ts
 * Lógica pura de identidade — sem HTTP, sem cookies, sem banco direto.
 * Recebe dependências via parâmetro (testável sem mocks de módulo).
 *
 * Quem autentica é o Keycloak (ADR-0009). O que sobra aqui são duas regras:
 * traduzir os papéis do realm para o papel do domínio, e garantir que todo
 * usuário autenticado tenha um espelho local — as Reservas e os Empréstimos
 * apontam para `users.id`, não para o `sub` do token.
 *
 * Papéis possíveis: 'leitor' | 'bibliotecario' (RN-7)
 */

import type { Role } from '@prisma/client';
import { AppError } from '../../shared/errors.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** O que o token do Keycloak diz sobre quem está chamando. */
export interface IdentityClaims {
  /** `sub` do token — identificador da conta no realm */
  externalId: string;
  email: string;
  name: string;
  /** `realm_access.roles` do token */
  realmRoles: readonly string[];
}

export interface UserLookup {
  id: string;
  externalId: string;
  name: string;
  email: string;
  role: Role;
  address: string | null;
  createdAt: Date;
}

export interface AuthDeps {
  findUserByExternalId: (externalId: string) => Promise<UserLookup | null>;
  createUser: (data: {
    externalId: string;
    name: string;
    email: string;
    role: Role;
  }) => Promise<UserLookup>;
  updateUserProfile: (
    id: string,
    data: { name: string; email: string; role: Role },
  ) => Promise<UserLookup>;
}

// ---------------------------------------------------------------------------
// Papel
// ---------------------------------------------------------------------------

/**
 * Traduz os papéis do realm para o papel do domínio.
 *
 * O realm entrega mais do que interessa: toda conta carrega
 * `default-roles-biblioteca`, `offline_access` e `uma_authorization` junto. O
 * que não é `leitor` nem `bibliotecario` é ignorado.
 *
 * `bibliotecario` vence `leitor` porque quem administra o balcão costuma
 * acumular os dois — e o papel de menor alcance não pode rebaixar o de maior.
 */
export function roleFromRealmRoles(realmRoles: readonly string[]): Role {
  if (realmRoles.includes('bibliotecario')) return 'bibliotecario';
  if (realmRoles.includes('leitor')) return 'leitor';

  throw new AppError(
    'FORBIDDEN',
    'Conta sem papel reconhecido neste sistema. Procure a biblioteca.',
  );
}

// ---------------------------------------------------------------------------
// Espelho local da identidade (JIT provisioning)
// ---------------------------------------------------------------------------

/**
 * Devolve o usuário local correspondente ao token, criando-o no primeiro acesso.
 *
 * É o que permite que qualquer pessoa se cadastre no Keycloak e já consiga
 * reservar: a linha em `users` nasce aqui, não num fluxo de cadastro nosso.
 *
 * O perfil é ressincronizado quando o realm diverge do espelho — o Keycloak é a
 * fonte de verdade de nome, e-mail e papel. `address` não entra: é dado nosso,
 * que o realm desconhece.
 */
export async function resolveLocalUser(
  claims: IdentityClaims,
  deps: AuthDeps,
): Promise<UserLookup> {
  const role = roleFromRealmRoles(claims.realmRoles);
  const existing = await deps.findUserByExternalId(claims.externalId);

  if (!existing) {
    return deps.createUser({
      externalId: claims.externalId,
      name: claims.name,
      email: claims.email,
      role,
    });
  }

  // Só escreve quando algo mudou de verdade: sem esta guarda seria um UPDATE
  // por requisição autenticada.
  const divergiu =
    existing.name !== claims.name ||
    existing.email !== claims.email ||
    existing.role !== role;

  if (!divergiu) return existing;

  return deps.updateUserProfile(existing.id, {
    name: claims.name,
    email: claims.email,
    role,
  });
}
