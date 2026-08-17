/**
 * packages/api/src/api/routes/reservations.test.ts
 * Testes de autorização das rotas de Reservas.
 *
 * Definition of done (AGENTS.md): toda rota nova tem teste de autorização —
 * papel errado ou não autenticado retorna 401/403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mockar repositório e serviço ANTES de importar a app — evita acesso ao Prisma/DB
vi.mock('../../infra/repositories/userRepository.js', async () => {
  const { fakeAuthRepoDeps } = await import('../../test/keycloak.js');
  return { authRepoDeps: fakeAuthRepoDeps() };
});

vi.mock('../../infra/repositories/reservationRepository.js', () => ({
  reservationRepoDeps: {
    findAvailableCopy: vi.fn(),
    createReservationTx: vi.fn(),
    findActiveReservationsByUser: vi.fn().mockResolvedValue([]),
    findReservationsByBook: vi.fn().mockResolvedValue([]),
  },
  findReservationDetail: vi.fn(),
  findAllReservations: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../domain/reservation/reservationService.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../domain/reservation/reservationService.js')>();
  return {
    ...original,
    createReservation: vi.fn(),
    listBookReservations: vi.fn().mockResolvedValue([]),
  };
});

import { createApp } from '../app.js';
import * as reservationRepo from '../../infra/repositories/reservationRepository.js';
import * as reservationService from '../../domain/reservation/reservationService.js';
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
  vi.mocked(reservationRepo.findAllReservations).mockResolvedValue([]);
  vi.mocked(reservationService.listBookReservations).mockResolvedValue([]);
});

const app = createApp();

const RESERVATION_DETAIL = {
  id: 'res-1',
  expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  convertedAt: null,
  cancelledAt: null,
  status: 'active' as const,
  copy: { id: 'copy-1', code: 'LIV-001', book: { id: 'book-1', title: 'Dom Casmurro', coverUrl: null, author: { id: 'author-1', name: 'Machado de Assis' } } },
  user: { id: 'user-1', name: 'João', email: 'joao@test.com' },
};

// ── POST /reservations ─────────────────────────────────────────────────────

describe('POST /reservations', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).post('/reservations').send({ bookId: 'book-1' });
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como bibliotecario (RN-7)', async () => {
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: 'book-1' });
    expect(res.status).toBe(403);
  });

  it('201 quando autenticado como leitor com cópia disponível', async () => {
    vi.mocked(reservationService.createReservation).mockResolvedValue({
      reservationId: 'res-1',
      copyId: 'copy-1',
      expiresAt: RESERVATION_DETAIL.expiresAt,
    });
    vi.mocked(reservationRepo.findReservationDetail).mockResolvedValue(RESERVATION_DETAIL);

    const token = await makeToken('leitor', 'user-1');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: 'book-1' });

    expect(res.status).toBe(201);
    expect(reservationService.createReservation).toHaveBeenCalledWith(
      { userId: 'user-1', bookId: 'book-1' },
      expect.anything(),
    );
  });

  it('422 quando bookId ausente', async () => {
    const token = await makeToken('leitor');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

// ── GET /reservations ──────────────────────────────────────────────────────

describe('GET /reservations', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).get('/reservations');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como leitor (RN-7)', async () => {
    const token = await makeToken('leitor');
    const res = await request(app)
      .get('/reservations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando autenticado como bibliotecario', async () => {
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .get('/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [] });
  });

  it('delega para findAllReservations sem filtro por padrão', async () => {
    const spy = vi.mocked(reservationRepo.findAllReservations);

    const token = await makeToken('bibliotecario');
    await request(app)
      .get('/reservations')
      .set('Authorization', `Bearer ${token}`);

    expect(spy).toHaveBeenCalledWith(undefined);
  });
});
