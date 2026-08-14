/**
 * packages/api/src/shared/errors.ts
 * Erros de domínio tipados — usados em todas as camadas.
 * NÃO importar nada de Express ou Prisma aqui.
 */

// ---------------------------------------------------------------------------
// Códigos de erro de domínio
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'UNAUTHORIZED'        // não autenticado (401)
  | 'FORBIDDEN'           // autenticado mas sem permissão (403)
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'NO_COPY_AVAILABLE'   // RN-3
  | 'RESERVATION_EXPIRED' // RN-6
  | 'INTERNAL_ERROR';

// ---------------------------------------------------------------------------
// AppError — erro de aplicação com código tipado e status HTTP
// ---------------------------------------------------------------------------

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode ?? AppError.defaultStatus(code);
  }

  private static defaultStatus(code: ErrorCode): number {
    switch (code) {
      case 'INVALID_CREDENTIALS':
      case 'TOKEN_EXPIRED':
      case 'TOKEN_INVALID':
      case 'UNAUTHORIZED':
        return 401;
      case 'FORBIDDEN':
        return 403;
      case 'NOT_FOUND':
        return 404;
      case 'CONFLICT':
        return 409;
      case 'VALIDATION_ERROR':
        return 422;
      case 'NO_COPY_AVAILABLE':
        return 409;
      case 'RESERVATION_EXPIRED':
        return 409;
      case 'INTERNAL_ERROR':
      default:
        return 500;
    }
  }
}
