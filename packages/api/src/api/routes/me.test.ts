/**
 * packages/api/src/api/routes/me.test.ts
 * Testes de autorização das rotas /me.
 *
 * Definition of done (AGENTS.md): toda rota nova tem teste de autorização —
 * papel errado ou não autenticado retorna 401/403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mockar repositórios ANTES de importar a app — evita acesso ao Prisma/DB
vi.mock('../../infra/repositories/userRepository.js', async () => {
  const { fakeAuthRepoDeps } = await import('../../test/keycloak.js');
  return { authRepoDeps: fakeAuthRepoDeps() };
});

vi.mock('../../infra/repositories/reservationRepository.js', () => ({
  reservationRepoDeps: {
    findAvailableCopy: vi.fn(),
    createReservationTx: vi.fn(),
    findActiveReservationsByUser: vi.fn().mockResolvedValue([]),
    findReservationsByBook: vi.fn(),
  },
  findReservationDetail: vi.fn(),
  findAllReservations: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../infra/repositories/loanRepository.js', () => ({
  loanRepoDeps: {
    findReservationById: vi.fn(),
    createLoanTx: vi.fn(),
    findLoanById: vi.fn(),
    returnLoanTx: vi.fn(),
    findLoans: vi.fn().mockResolvedValue([]),
  },
  findLoanDetail: vi.fn(),
}));

import { createApp } from '../app.js';
import * as reservationRepo from '../../infra/repositories/reservationRepository.js';
import * as loanRepo from '../../infra/repositories/loanRepository.js';
import { tokenDe, instalarChavesDeTeste } from '../../test/keycloak.js';

/** Token RS256 assinado pelo kit de teste — o `sub` vira o id local. */
function makeToken(
  role: 'leitor' | 'bibliotecario',
  userId = 'user-1',
): Promise<string> {
  return tokenDe(role, userId);
}

beforeEach(async () => {
  await instalarChavesDeTeste();
  vi.clearAllMocks();
  // Reset dos mocks para retornar defaults
  vi.mocked(reservationRepo.reservationRepoDeps.findActiveReservationsByUser).mockResolvedValue([]);
  vi.mocked(loanRepo.loanRepoDeps.findLoans).mockResolvedValue([]);
});

const app = createApp();

// ── GET /me ────────────────────────────────────────────────────────────────

describe('GET /me', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('devolve o perfil local de quem está autenticado', async () => {
    // O id vem do espelho local criado no primeiro acesso (ADR-0009), não do
    // corpo da requisição — é a prova de que o JIT provisioning rodou.
    const token = await makeToken('leitor', 'leitor-7');
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // toEqual e não toMatchObject: o corpo é afirmado por inteiro, então um
    // campo a mais quebra o teste — `externalId` (o `sub` do realm) é assunto
    // interno e não pode vazar para o cliente.
    expect(res.body).toEqual({
      data: {
        id: 'leitor-7',
        name: 'Usuário de Teste',
        email: 'leitor-7@biblioteca.dev',
        role: 'leitor',
        address: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('aberta aos dois papéis — não é rota de Leitor', async () => {
    const token = await makeToken('bibliotecario', 'bib-3');
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { role: 'bibliotecario' } });
  });
});

// ── GET /me/reservations ───────────────────────────────────────────────────

describe('GET /me/reservations', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/me/reservations');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como bibliotecario (RN-7)', async () => {
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .get('/me/reservations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como leitor', async () => {
    const token = await makeToken('leitor', 'leitor-1');
    const res = await request(app)
      .get('/me/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('passa o userId do token para o repositório', async () => {
    const spy = vi.mocked(reservationRepo.reservationRepoDeps.findActiveReservationsByUser);

    const token = await makeToken('leitor', 'leitor-42');
    await request(app)
      .get('/me/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalledWith({ userId: 'leitor-42' });
  });
});

// ── GET /me/loans ──────────────────────────────────────────────────────────

describe('GET /me/loans', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/me/loans');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como bibliotecario (RN-7)', async () => {
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como leitor', async () => {
    const token = await makeToken('leitor', 'leitor-1');
    const res = await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('passa o userId do token para o repositório', async () => {
    const spy = vi.mocked(loanRepo.loanRepoDeps.findLoans);

    const token = await makeToken('leitor', 'leitor-99');
    await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalledWith({ userId: 'leitor-99' });
  });
});
