/**
 * Testes do middleware de correlation id.
 * O id precisa ser estável (ecoado quando o cliente manda) e sempre existir na
 * resposta — é ele que liga o que o usuário vê ao log e ao trace.
 */

import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { requestId } from './requestContext.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fazerReq(headers: Record<string, string | string[]> = {}): Request {
  return { headers } as unknown as Request;
}

function fazerNext(): NextFunction {
  return vi.fn() as NextFunction;
}

function fazerRes(): { res: Response; headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  const res = {
    setHeader: (nome: string, valor: unknown): void => {
      headers[nome] = valor;
    },
  } as unknown as Response;
  return { res, headers };
}

describe('requestId', () => {
  it('gera um UUID quando o cliente não manda X-Request-Id', () => {
    const req = fazerReq();
    const { res, headers } = fazerRes();
    const next = fazerNext();

    requestId(req, res, next);

    expect(req.requestId).toMatch(UUID_V4);
    expect(headers['X-Request-Id']).toBe(req.requestId);
    expect(next as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
  });

  it('reaproveita o X-Request-Id recebido', () => {
    const req = fazerReq({ 'x-request-id': 'id-vindo-do-cliente' });
    const { res, headers } = fazerRes();

    requestId(req, res, fazerNext());

    expect(req.requestId).toBe('id-vindo-do-cliente');
    expect(headers['X-Request-Id']).toBe('id-vindo-do-cliente');
  });

  it('usa a primeira ocorrência quando o header vem repetido', () => {
    const req = fazerReq({ 'x-request-id': ['primeiro', 'segundo'] });
    const { res } = fazerRes();

    requestId(req, res, fazerNext());

    expect(req.requestId).toBe('primeiro');
  });

  it('descarta header maior que 128 caracteres e gera um novo', () => {
    const req = fazerReq({ 'x-request-id': 'x'.repeat(129) });
    const { res } = fazerRes();

    requestId(req, res, fazerNext());

    expect(req.requestId).toMatch(UUID_V4);
  });

  it('descarta header vazio e gera um novo', () => {
    const req = fazerReq({ 'x-request-id': '' });
    const { res } = fazerRes();

    requestId(req, res, fazerNext());

    expect(req.requestId).toMatch(UUID_V4);
  });
});
