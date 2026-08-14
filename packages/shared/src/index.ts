/**
 * packages/shared/src/index.ts
 * Tipos TypeScript compartilhados entre packages/api e packages/web.
 * Derivados do schema Prisma e do contrato OpenAPI.
 * NÃO importar nada de Node.js, HTTP ou banco aqui.
 */

// Re-exportar todos os tipos
export * from './types/domain.js';
export * from './types/api.js';
