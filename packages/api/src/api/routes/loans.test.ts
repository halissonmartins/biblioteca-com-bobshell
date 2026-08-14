/**
 * packages/api/src/api/routes/loans.test.ts
 * Testes de autorização das rotas de Empréstimos.
 *
 * Definition of done (AGENTS.md): toda rota nova tem teste de autorização —
 * papel errado ou não autenticado retorna 401/403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mockar repositórios e serviço ANTES de importar a app
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

vi.mock('../../domain/loan/loanService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../domain/loan/loanService.js')>();
  return {
    ...original,
    createLoan: vi.fn(),
    returnLoan: vi.fn().mockResolvedValue(undefined),
    listLoans: vi.fn().mockResolvedValue([]),
  };
});

import { createApp } from '../app.js';
import * as loanRepo from '../../infra/repositories/loanRepository.js';
import * as loanService from '../../domain/loan/loanService.js';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-loans';

function makeToken(role: 'leitor' | 'bibliotecario', userId = 'user-1'): string {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: '1h' });
}

beforeEach(() => {
  process.env['JWT_SECRET'] = SECRET;
  vi.clearAllMocks();
  vi.mocked(loanRepo.loanRepoDeps.findLoans).mockResolvedValue([]);
  vi.mocked(loanService.listLoans).mockResolvedValue([]);
  vi.mocked(loanService.returnLoan).mockResolvedValue(undefined);
});

const app = createApp();

const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

const LOAN_DETAIL = {
  id: 'loan-1',
  dueAt: FUTURE_ISO,
  returnedAt: null,
  createdAt: new Date().toISOString(),
  copy: { id: 'copy-1', code: 'LIV-001', book: { id: 'book-1', title: 'Dom Casmurro', coverUrl: null } },
  reader: { id: 'user-1', name: 'João', email: 'joao@test.com' },
  librarian: { id: 'lib-1', name: 'Ana' },
};

// ── POST /loans ────────────────────────────────────────────────────────────

describe('POST /loans', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app)
      .post('/loans')
      .send({ reservationId: 'res-1', dueAt: FUTURE_ISO });
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como leitor (RN-2, RN-7)', async () => {
    const token = makeToken('leitor');
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ reservationId: 'res-1', dueAt: FUTURE_ISO });
    expect(res.status).toBe(403);
  });

  it('201 quando autenticado como bibliotecario', async () => {
    vi.mocked(loanService.createLoan).mockResolvedValue({
      loanId: 'loan-1',
      copyId: 'copy-1',
      dueAt: FUTURE_ISO,
    });
    vi.mocked(loanRepo.findLoanDetail).mockResolvedValue(LOAN_DETAIL);

    const token = makeToken('bibliotecario', 'lib-1');
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ reservationId: 'res-1', dueAt: FUTURE_ISO });

    expect(res.status).toBe(201);
  });

  it('422 quando reservationId ausente', async () => {
    const token = makeToken('bibliotecario');
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ dueAt: FUTURE_ISO });
    expect(res.status).toBe(422);
  });

  it('422 quando dueAt não é ISO 8601', async () => {
    const token = makeToken('bibliotecario');
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({ reservationId: 'res-1', dueAt: '21/08/2026' });
    expect(res.status).toBe(422);
  });
});

// ── PATCH /loans/:id/return ────────────────────────────────────────────────

describe('PATCH /loans/:id/return', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).patch('/loans/loan-1/return');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como leitor (RN-7)', async () => {
    const token = makeToken('leitor');
    const res = await request(app)
      .patch('/loans/loan-1/return')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como bibliotecario', async () => {
    vi.mocked(loanRepo.findLoanDetail).mockResolvedValue({
      ...LOAN_DETAIL,
      returnedAt: new Date().toISOString(),
    });

    const token = makeToken('bibliotecario', 'lib-1');
    const res = await request(app)
      .patch('/loans/loan-1/return')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ── GET /loans ─────────────────────────────────────────────────────────────

describe('GET /loans', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/loans');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como leitor (RN-7)', async () => {
    const token = makeToken('leitor');
    const res = await request(app)
      .get('/loans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como bibliotecario', async () => {
    const token = makeToken('bibliotecario');
    const res = await request(app)
      .get('/loans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('passa userId do query para o serviço (RF-B3)', async () => {
    const spy = vi.mocked(loanService.listLoans);

    const token = makeToken('bibliotecario');
    await request(app)
      .get('/loans?userId=user-42')
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalledWith({ userId: 'user-42' }, expect.anything());
  });
});
