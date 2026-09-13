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
    findReservationForCancel: vi.fn(),
    cancelReservationTx: vi.fn(),
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
    cancelReservation: vi.fn(),
    listBookReservations: vi.fn().mockResolvedValue([]),
  };
});

// Contadores dublados um a um: sem o NodeSDK, o meter no-op devolve a mesma
// instância para todo contador, e as chamadas de um se misturariam às do outro.
const contadores = vi.hoisted(() => ({ reservasCriadas: vi.fn(), reservasCanceladas: vi.fn() }));

vi.mock('../../infra/telemetry/metrics.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../infra/telemetry/metrics.js')>();
  return {
    ...original,
    reservasCriadas: { add: contadores.reservasCriadas },
    reservasCanceladas: { add: contadores.reservasCanceladas },
  };
});

import { createApp } from '../app.js';
import * as reservationRepo from '../../infra/repositories/reservationRepository.js';
import * as reservationService from '../../domain/reservation/reservationService.js';
import { AppError, type ErrorCode } from '../../shared/errors.js';
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
  expiredAt: null,
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
    // Contrato consumido pela tela de detalhes do Livro (docs/openapi.yaml).
    expect(res.body).toMatchObject({ data: { reservation: { id: 'res-1', status: 'active' } } });
    expect(contadores.reservasCriadas).toHaveBeenCalledWith(1, { resultado: 'criada' });
  });

  it('422 quando bookId ausente', async () => {
    const token = await makeToken('leitor');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('422 devolve a mensagem do schema, não um texto genérico', async () => {
    const token = await makeToken('leitor');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: '' });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('bookId obrigatório');
    expect(reservationService.createReservation).not.toHaveBeenCalled();
  });

  // `resultado` separa acervo esgotado (sinal de compra) de regra barrando o
  // Leitor (sinal de uso) — as duas chegam como 409 e dizem coisas opostas.
  it.each<[ErrorCode, string]>([
    ['NO_COPY_AVAILABLE', 'sem_copia'],            // RN-3
    ['DUPLICATE_RESERVATION', 'duplicada'],        // RN-9
    ['RESERVATION_LIMIT_REACHED', 'limite'],       // RN-10
    ['NOT_FOUND', 'erro'],
  ])('recusa %s conta como %s e mantém a resposta de erro', async (code, resultado) => {
    vi.mocked(reservationService.createReservation).mockRejectedValue(new AppError(code, 'recusada'));

    const token = await makeToken('leitor', 'user-1');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: 'book-1' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(contadores.reservasCriadas).toHaveBeenCalledWith(1, { resultado });
    expect(contadores.reservasCriadas).not.toHaveBeenCalledWith(1, { resultado: 'criada' });
  });

  it('erro que não é AppError conta como erro e vira 500', async () => {
    vi.mocked(reservationService.createReservation).mockRejectedValue(new Error('banco caiu'));

    const token = await makeToken('leitor', 'user-1');
    const res = await request(app)
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookId: 'book-1' });

    expect(res.status).toBe(500);
    expect(contadores.reservasCriadas).toHaveBeenCalledWith(1, { resultado: 'erro' });
  });
});

// ── PATCH /reservations/:id/cancel ─────────────────────────────────────────

describe('PATCH /reservations/:id/cancel', () => {
  it('401 quando não autenticado', async () => {
    const res = await request(app).patch('/reservations/res-1/cancel');
    expect(res.status).toBe(401);
  });

  it('403 quando autenticado como bibliotecario (RN-7, RN-11)', async () => {
    // Cancelar é ato do Leitor sobre a própria Reserva. O balcão desfaz Reserva
    // convertendo ou esperando o prazo, não cancelando pelo Leitor.
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .patch('/reservations/res-1/cancel')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 quando o próprio Leitor cancela, e o Leitor vem do TOKEN (ADR-0009)', async () => {
    vi.mocked(reservationService.cancelReservation).mockResolvedValue(undefined);
    vi.mocked(reservationRepo.findReservationDetail).mockResolvedValue({
      ...RESERVATION_DETAIL,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });

    const token = await makeToken('leitor', 'user-1');
    const res = await request(app)
      .patch('/reservations/res-1/cancel')
      .set('Authorization', `Bearer ${token}`)
      // Um `userId` no corpo não pode virar o Leitor da operação: o papel e a
      // identidade saem do token, sempre (ADR-0009).
      .send({ userId: 'outro-leitor' });

    expect(res.status).toBe(200);
    expect(reservationService.cancelReservation).toHaveBeenCalledWith(
      { reservationId: 'res-1', userId: 'user-1' },
      expect.anything(),
    );
    expect(res.body).toMatchObject({ data: { reservation: { status: 'cancelled' } } });
    expect(contadores.reservasCanceladas).toHaveBeenCalledWith(1, { resultado: 'cancelada' });
  });

  it.each<[string, Error, string]>([
    ['Reserva inexistente ou de outro Leitor', new AppError('NOT_FOUND', 'x'), 'nao_encontrada'], // RN-11
    ['prazo vencido', new AppError('RESERVATION_EXPIRED', 'x'), 'expirada'],                      // RN-1
    ['Reserva já encerrada', new AppError('CONFLICT', 'x'), 'encerrada'],
    ['outro AppError', new AppError('VALIDATION_ERROR', 'x'), 'erro'],
    ['erro inesperado', new Error('banco caiu'), 'erro'],
  ])('cancelamento recusado por %s conta como %s', async (_caso, erro, resultado) => {
    vi.mocked(reservationService.cancelReservation).mockRejectedValue(erro);

    const token = await makeToken('leitor', 'user-1');
    const res = await request(app)
      .patch('/reservations/res-1/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(contadores.reservasCanceladas).toHaveBeenCalledWith(1, { resultado });
    expect(contadores.reservasCanceladas).not.toHaveBeenCalledWith(1, { resultado: 'cancelada' });
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

  it('filtra por Leitor quando userId vem na query (RF-B3)', async () => {
    const token = await makeToken('bibliotecario');
    await request(app)
      .get('/reservations?userId=user-42')
      .set('Authorization', `Bearer ${token}`);

    expect(reservationRepo.findAllReservations).toHaveBeenCalledWith('user-42');
  });

  it('com bookId na query, lista as Reservas do Livro (RF-B1)', async () => {
    vi.mocked(reservationService.listBookReservations).mockResolvedValue([RESERVATION_DETAIL]);

    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .get('/reservations?bookId=book-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(reservationService.listBookReservations).toHaveBeenCalledWith(
      { bookId: 'book-1' },
      expect.anything(),
    );
    expect(reservationRepo.findAllReservations).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ data: [{ id: 'res-1' }] });
  });

  it('422 quando bookId vem repetido na query', async () => {
    const token = await makeToken('bibliotecario');
    const res = await request(app)
      .get('/reservations?bookId=a&bookId=b')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('Expected string');
    expect(reservationService.listBookReservations).not.toHaveBeenCalled();
    expect(reservationRepo.findAllReservations).not.toHaveBeenCalled();
  });
});
