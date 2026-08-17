/**
 * packages/api/src/domain/auth/authService.test.ts
 * Testes unitários da lógica pura de identidade (ADR-0009).
 *
 * Sem banco, sem HTTP, sem Keycloak: as duas funções recebem tudo por parâmetro.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Role } from '@prisma/client';
import {
  roleFromRealmRoles,
  resolveLocalUser,
  type AuthDeps,
  type IdentityClaims,
  type UserLookup,
} from './authService.js';
import { AppError } from '../../shared/errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLAIMS: IdentityClaims = {
  externalId: 'kc-sub-123',
  email: 'ana@biblioteca.dev',
  name: 'Ana Lima',
  realmRoles: ['leitor'],
};

function userLocal(overrides: Partial<UserLookup> = {}): UserLookup {
  return {
    id: 'local-1',
    externalId: 'kc-sub-123',
    name: 'Ana Lima',
    email: 'ana@biblioteca.dev',
    role: 'leitor' as Role,
    address: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    findUserByExternalId: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockImplementation((data: { externalId: string }) =>
      Promise.resolve(userLocal({ id: 'novo-1', externalId: data.externalId })),
    ),
    updateUserProfile: vi.fn().mockResolvedValue(userLocal()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// roleFromRealmRoles
// ---------------------------------------------------------------------------

describe('roleFromRealmRoles()', () => {
  it('reconhece leitor', () => {
    expect(roleFromRealmRoles(['leitor'])).toBe('leitor');
  });

  it('reconhece bibliotecario', () => {
    expect(roleFromRealmRoles(['bibliotecario'])).toBe('bibliotecario');
  });

  it('ignora os papéis técnicos que o realm entrega junto', () => {
    // Toda conta auto-cadastrada carrega estes três — não são papéis do domínio.
    const doRealm = ['default-roles-biblioteca', 'offline_access', 'uma_authorization', 'leitor'];
    expect(roleFromRealmRoles(doRealm)).toBe('leitor');
  });

  it('bibliotecario vence leitor quando a conta acumula os dois', () => {
    expect(roleFromRealmRoles(['leitor', 'bibliotecario'])).toBe('bibliotecario');
    expect(roleFromRealmRoles(['bibliotecario', 'leitor'])).toBe('bibliotecario');
  });

  it('lança FORBIDDEN quando não há papel deste sistema', () => {
    // Conta que existe no realm mas não pertence à biblioteca: 403, não 401 —
    // ela se autenticou, só não tem o que fazer aqui.
    expect(() => roleFromRealmRoles(['offline_access'])).toThrow(AppError);
    try {
      roleFromRealmRoles([]);
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      expect((err as AppError).code).toBe('FORBIDDEN');
      expect((err as AppError).statusCode).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveLocalUser
// ---------------------------------------------------------------------------

describe('resolveLocalUser()', () => {
  it('cria o espelho local no primeiro acesso (JIT provisioning)', async () => {
    const deps = makeDeps();

    const user = await resolveLocalUser(CLAIMS, deps);

    expect(deps.createUser).toHaveBeenCalledWith({
      externalId: 'kc-sub-123',
      name: 'Ana Lima',
      email: 'ana@biblioteca.dev',
      role: 'leitor',
    });
    expect(user.id).toBe('novo-1');
  });

  it('é assim que uma conta recém-cadastrada no Keycloak consegue reservar', async () => {
    // O cadastro acontece só no realm; a linha em `users` — de que Reserva e
    // Empréstimo dependem por FK — nasce no primeiro acesso autenticado.
    const deps = makeDeps();

    const user = await resolveLocalUser(
      { ...CLAIMS, externalId: 'kc-novato', email: 'novo@dominio.invalido', name: 'Novo' },
      deps,
    );

    expect(user.externalId).toBe('kc-novato');
    expect(user.role).toBe('leitor');
  });

  it('reusa o usuário existente sem escrever no banco', async () => {
    const existente = userLocal();
    const deps = makeDeps({ findUserByExternalId: vi.fn().mockResolvedValue(existente) });

    const user = await resolveLocalUser(CLAIMS, deps);

    expect(user).toBe(existente);
    expect(deps.createUser).not.toHaveBeenCalled();
    // A guarda que evita um UPDATE por requisição autenticada.
    expect(deps.updateUserProfile).not.toHaveBeenCalled();
  });

  it('ressincroniza o perfil quando o realm diverge do espelho', async () => {
    const deps = makeDeps({
      findUserByExternalId: vi.fn().mockResolvedValue(userLocal({ name: 'Ana L.' })),
    });

    await resolveLocalUser(CLAIMS, deps);

    expect(deps.updateUserProfile).toHaveBeenCalledWith('local-1', {
      name: 'Ana Lima',
      email: 'ana@biblioteca.dev',
      role: 'leitor',
    });
  });

  it('promove o papel quando o Bibliotecário o recebe no realm', async () => {
    // O papel é atribuído no console do Keycloak; o espelho local segue o realm.
    const deps = makeDeps({
      findUserByExternalId: vi.fn().mockResolvedValue(userLocal({ role: 'leitor' })),
    });

    await resolveLocalUser({ ...CLAIMS, realmRoles: ['bibliotecario'] }, deps);

    expect(deps.updateUserProfile).toHaveBeenCalledWith(
      'local-1',
      expect.objectContaining({ role: 'bibliotecario' }),
    );
  });

  it('não cria nada para conta sem papel deste sistema', async () => {
    const deps = makeDeps();

    await expect(
      resolveLocalUser({ ...CLAIMS, realmRoles: [] }, deps),
    ).rejects.toThrow(AppError);

    expect(deps.findUserByExternalId).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });
});
