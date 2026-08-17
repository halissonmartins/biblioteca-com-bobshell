/**
 * packages/api/src/infra/keycloak/tokenVerifier.ts
 * Verificação criptográfica do access token emitido pelo Keycloak (ADR-0009).
 *
 * A API é resource server: nunca emite nem renova token. Aqui só se confere que
 * o token veio do realm certo, para esta API, e ainda vale.
 *
 * O JWKS é buscado uma vez e cacheado pelo `jose`, que rebusca sozinho quando
 * aparece um `kid` desconhecido (rotação de chave do realm) — com cooldown, para
 * um token forjado não virar enxurrada de requisições ao Keycloak.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError } from '../../shared/errors.js';

// ---------------------------------------------------------------------------
// Claims que o realm entrega e que nos interessam
// ---------------------------------------------------------------------------

export interface KeycloakClaims {
  sub: string;
  email: string;
  name: string;
  realmRoles: readonly string[];
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export function issuerUrl(): string {
  const url = process.env['KEYCLOAK_ISSUER_URL'];
  if (!url) {
    throw new AppError('INTERNAL_ERROR', 'KEYCLOAK_ISSUER_URL não configurado');
  }
  return url.replace(/\/$/, '');
}

export function audience(): string {
  const aud = process.env['KEYCLOAK_AUDIENCE'];
  if (!aud) {
    throw new AppError('INTERNAL_ERROR', 'KEYCLOAK_AUDIENCE não configurado');
  }
  return aud;
}

// ---------------------------------------------------------------------------
// Resolução de chave
// ---------------------------------------------------------------------------

let keySet: JWTVerifyGetKey | null = null;

/**
 * Ponto de extensão para teste.
 *
 * Sem isto o único jeito de testar o middleware seria `vi.mock('jose')` — que
 * exercita o mock, não a verificação. Com isto o teste gera um par RSA de
 * verdade, assina de verdade e o caminho de produção continua inteiro.
 */
export function setKeySet(resolver: JWTVerifyGetKey | null): void {
  keySet = resolver;
}

function getKeySet(): JWTVerifyGetKey {
  keySet ??= createRemoteJWKSet(
    new URL(`${issuerUrl()}/protocol/openid-connect/certs`),
  );
  return keySet;
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

interface RawPayload {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

/**
 * Verifica assinatura, emissor, audiência e validade temporal.
 * Lança `AppError` — nunca vaza erro do `jose` para a borda HTTP.
 */
export async function verifyAccessToken(token: string): Promise<KeycloakClaims> {
  let payload: RawPayload;

  try {
    const result = await jwtVerify(token, getKeySet(), {
      issuer: issuerUrl(),
      audience: audience(),
    });
    payload = result.payload as RawPayload;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') {
      throw new AppError('TOKEN_EXPIRED', 'Token de acesso expirado');
    }
    throw new AppError('TOKEN_INVALID', 'Token de acesso inválido');
  }

  if (!payload.sub) {
    throw new AppError('TOKEN_INVALID', 'Token sem identificação de usuário');
  }

  // `name` só existe com o escopo `profile`; `preferred_username` é o e-mail
  // (o realm usa e-mail como username). Um dos dois sempre chega.
  const name = payload.name ?? payload.preferred_username ?? payload.email;
  const email = payload.email ?? payload.preferred_username;

  if (!email || !name) {
    throw new AppError('TOKEN_INVALID', 'Token sem e-mail ou nome do usuário');
  }

  return {
    sub: payload.sub,
    email,
    name,
    realmRoles: payload.realm_access?.roles ?? [],
  };
}
