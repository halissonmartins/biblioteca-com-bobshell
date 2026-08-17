/**
 * packages/api/src/test/keycloak.ts
 * Kit de teste da identidade — NÃO é código de produção e não é um `*.test.ts`.
 *
 * Emite tokens RS256 de verdade, assinados por um par de chaves gerado na hora,
 * e aponta o verificador para esse par. A alternativa seria `vi.mock('jose')`,
 * que exercitaria o mock em vez da verificação: assinatura, `iss`, `aud` e
 * expiração passariam a ser afirmações sobre nada.
 *
 * Uso típico num teste de rota:
 *
 *   vi.mock('../../infra/repositories/userRepository.js', async () => {
 *     const { fakeAuthRepoDeps } = await import('../../test/keycloak.js');
 *     return { authRepoDeps: fakeAuthRepoDeps() };
 *   });
 *   beforeEach(async () => { await instalarChavesDeTeste(); });
 */

import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from 'jose';
import type { Role } from '@prisma/client';
import type { AuthDeps, UserLookup } from '../domain/auth/authService.js';
import { setKeySet } from '../infra/keycloak/tokenVerifier.js';

export const ISSUER = 'http://localhost:8081/realms/biblioteca';
export const AUDIENCE = 'biblioteca-api';
const KID = 'chave-de-teste';

let chaves: { privateKey: KeyLike; publicJwk: JWK } | null = null;

/**
 * Gera o par (uma vez por processo), registra a chave pública no verificador e
 * ajusta as variáveis de ambiente que ele lê.
 */
export async function instalarChavesDeTeste(): Promise<void> {
  process.env['KEYCLOAK_ISSUER_URL'] = ISSUER;
  process.env['KEYCLOAK_AUDIENCE'] = AUDIENCE;

  if (!chaves) {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256' };
    chaves = { privateKey, publicJwk };
  }

  setKeySet(createLocalJWKSet({ keys: [chaves.publicJwk] }));
}

/** Desfaz a instalação — o próximo uso volta a buscar o JWKS remoto. */
export function removerChavesDeTeste(): void {
  setKeySet(null);
}

export interface OpcoesDeToken {
  sub?: string;
  email?: string;
  name?: string;
  realmRoles?: readonly string[];
  issuer?: string;
  audience?: string;
  /** Vida do token; aceita valor negativo para produzir um token já expirado. */
  expiraEm?: string;
}

/** Assina um access token no formato que o realm emite. */
export async function emitirToken(opcoes: OpcoesDeToken = {}): Promise<string> {
  if (!chaves) await instalarChavesDeTeste();
  if (!chaves) throw new Error('kit de teste: par de chaves não foi gerado');
  const { privateKey } = chaves;

  const sub = opcoes.sub ?? 'usuario-de-teste';

  return new SignJWT({
    email: opcoes.email ?? `${sub}@biblioteca.dev`,
    name: opcoes.name ?? 'Usuário de Teste',
    realm_access: { roles: [...(opcoes.realmRoles ?? ['leitor'])] },
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(sub)
    .setIssuer(opcoes.issuer ?? ISSUER)
    .setAudience(opcoes.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opcoes.expiraEm ?? '1h')
    .sign(privateKey);
}

/**
 * Atalho para os testes de rota, que só se importam com papel e id local.
 * O `sub` do token vira o id local — ver `fakeAuthRepoDeps`.
 */
export async function tokenDe(role: Role, userId = 'user-1'): Promise<string> {
  return emitirToken({ sub: userId, realmRoles: [role] });
}

/**
 * Dependências de repositório em memória para o JIT provisioning.
 *
 * Devolve sempre "usuário ainda não existe", então `resolveLocalUser` cria — e
 * o id local sai igual ao `sub` do token. É isso que permite ao teste escolher
 * o id de quem está chamando apenas emitindo o token.
 */
export function fakeAuthRepoDeps(): AuthDeps {
  const criar = (data: {
    externalId: string;
    name: string;
    email: string;
    role: Role;
  }): UserLookup => ({
    id: data.externalId,
    externalId: data.externalId,
    name: data.name,
    email: data.email,
    role: data.role,
    address: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  return {
    findUserByExternalId: () => Promise.resolve(null),
    createUser: (data) => Promise.resolve(criar(data)),
    updateUserProfile: (id, data) =>
      Promise.resolve({ ...criar({ externalId: id, ...data }), id }),
  };
}
