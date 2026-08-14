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
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-me';

function makeToken(role: 'leitor' | 'bibliotecario', userId = 'user-1') {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  process.env['JWT_SECRET'] = SECRET;
  vi.clearAllMocks();
  // Reset dos mocks para retornar defaults
  vi.mocked(reservationRepo.reservationRepoDeps.findActiveReservationsByUser).mockResolvedValue([]);
  vi.mocked(loanRepo.loanRepoDeps.findLoans).mockResolvedValue([]);
});

const app = createApp();

// ── GET /me/reservations ───────────────────────────────────────────────────

describe('GET /me/reservations', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/me/reservations');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como bibliotecario (RN-7)', async () => {
    const token = makeToken('bibliotecario');
    const res = await request(app)
      .get('/me/reservations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como leitor', async () => {
    const token = makeToken('leitor', 'leitor-1');
    const res = await request(app)
      .get('/me/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('passa o userId do token para o repositório', async () => {
    const spy = vi.mocked(reservationRepo.reservationRepoDeps.findActiveReservationsByUser);

    const token = makeToken('leitor', 'leitor-42');
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
    const token = makeToken('bibliotecario');
    const res = await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como leitor', async () => {
    const token = makeToken('leitor', 'leitor-1');
    const res = await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('passa o userId do token para o repositório', async () => {
    const spy = vi.mocked(loanRepo.loanRepoDeps.findLoans);

    const token = makeToken('leitor', 'leitor-99');
    await request(app)
      .get('/me/loans')
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalledWith({ userId: 'leitor-99' });
  });
});
