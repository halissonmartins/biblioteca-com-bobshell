/**
 * Testes do handler global de erros.
 * AppError é negócio esperado (warn + status tipado); qualquer outra coisa é
 * defeito (500 sem vazar detalhe em produção). O corpo JSON malformado do
 * body-parser entra como validação, não como 500.
 */

import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../shared/errors.js';
import { errorHandler } from './errorHandler.js';

interface RespostaCapturada {
  status?: number;
  body?: unknown;
}

function fazerRes(): { res: Response; captura: RespostaCapturada } {
  const captura: RespostaCapturada = {};
  const res = {
    status(code: number): Response {
      captura.status = code;
      return this as unknown as Response;
    },
    json(body: unknown): Response {
      captura.body = body;
      return this as unknown as Response;
    },
  } as unknown as Response;
  return { res, captura };
}

function fazerReq(extra: Partial<Request> = {}): Request {
  return { method: 'GET', originalUrl: '/livros', ...extra } as unknown as Request;
}

const next = vi.fn() as NextFunction;

describe('errorHandler', () => {
  it('responde com status e código do AppError', () => {
    const { res, captura } = fazerRes();
    const erro = new AppError('NO_COPY_AVAILABLE', 'Nenhuma Cópia disponível');

    errorHandler(erro, fazerReq(), res, next);

    expect(captura.status).toBe(409);
    expect(captura.body).toEqual({
      error: { code: 'NO_COPY_AVAILABLE', message: 'Nenhuma Cópia disponível' },
    });
  });

  it('converte corpo JSON malformado em erro de validação (422)', () => {
    const { res, captura } = fazerRes();
    const erro = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    });

    errorHandler(erro, fazerReq(), res, next);

    expect(captura.status).toBe(422);
    expect(captura.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Corpo JSON inválido' },
    });
  });

  it('devolve 500 com a mensagem do erro fora de produção', () => {
    const { res, captura } = fazerRes();

    errorHandler(new Error('falha de conexão'), fazerReq(), res, next);

    expect(captura.status).toBe(500);
    expect(captura.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'falha de conexão' },
    });
  });

  it('não vaza detalhes quando o erro não é um Error', () => {
    const { res, captura } = fazerRes();

    errorHandler('algo explodiu', fazerReq(), res, next);

    expect(captura.status).toBe(500);
    expect(captura.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    });
  });

  it('trata err nulo sem lançar', () => {
    const { res, captura } = fazerRes();

    expect(() => {
      errorHandler(null, fazerReq(), res, next)
    }).not.toThrow();
    expect(captura.status).toBe(500);
  });
});
