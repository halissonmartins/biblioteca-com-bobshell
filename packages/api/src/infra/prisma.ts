/**
 * packages/api/src/infra/prisma.ts
 * Singleton do PrismaClient — único ponto de instância em toda a aplicação.
 * Importar este módulo em vez de criar `new PrismaClient()` diretamente.
 *
 * Telemetria: uma extensão de query cria um span e registra a duração de cada
 * operação de modelo. NÃO usamos @prisma/instrumentation porque a versão que
 * casa com o Prisma 5.22 exige @opentelemetry/instrumentation ^0.49–^0.53,
 * incompatível com o SDK 0.221 desta base. Trade-off aceito: não há spans
 * internos do engine Rust (SQL real, pool de conexões) — medimos o tempo
 * Node → engine → Node, que é o que responde pelos SLOs do PRD.
 */

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { PrismaClient } from '@prisma/client';

import { dbOperationDuration } from './telemetry/metrics.js';

const tracer = trace.getTracer('biblioteca.prisma');

async function comSpanDeBanco<T>(
  model: string,
  operation: string,
  executar: () => Promise<T>,
): Promise<T> {
  const inicio = performance.now();
  const attributes = {
    'db.system.name': 'postgresql',
    'db.operation.name': operation,
    'db.collection.name': model,
  };

  const registrarDuracao = (): void => {
    dbOperationDuration.record((performance.now() - inicio) / 1000, attributes);
  };

  // Sem span ativo (ex.: callbacks dos gauges observáveis, que rodam fora de
  // uma requisição) não criamos span órfão de 1 nó no Jaeger. A métrica
  // continua sendo registrada.
  if (trace.getActiveSpan() === undefined) {
    try {
      return await executar();
    } finally {
      registrarDuracao();
    }
  }

  return tracer.startActiveSpan(
    `prisma ${model}.${operation}`,
    { kind: SpanKind.CLIENT, attributes },
    async (span) => {
      try {
        return await executar();
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        registrarDuracao();
        span.end();
      }
    },
  );
}

// O tipo de retorno é o tipo inferido do $extends — inescrevível à mão.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function criarPrismaClient() {
  const client = new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
  });

  return client.$extends({
    name: 'otel',
    query: {
      $allModels: {
        // Devolve query(args) sem envolver numa Promise extra: a forma de array
        // de $transaction([...]) exige PrismaPromise de verdade, e quebraria se
        // a extensão devolvesse uma Promise comum.
        $allOperations: ({ model, operation, args, query }) =>
          comSpanDeBanco(model, operation, () => query(args)),
      },
    },
  });
}

/**
 * Alias nomeado é obrigatório: com `declaration: true` no tsconfig, o tipo
 * inferido do $extends não é emitível em um .d.ts.
 */
export type PrismaClientComTelemetria = ReturnType<typeof criarPrismaClient>;

declare global {
  // Evita múltiplas instâncias durante hot-reload em desenvolvimento
  // eslint-disable-next-line no-var
  var __prisma: PrismaClientComTelemetria | undefined;
}

export const prisma: PrismaClientComTelemetria = global.__prisma ?? criarPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  global.__prisma = prisma;
}
