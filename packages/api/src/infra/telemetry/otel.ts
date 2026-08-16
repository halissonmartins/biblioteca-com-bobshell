/**
 * packages/api/src/infra/telemetry/otel.ts
 * Bootstrap do OpenTelemetry — traces, métricas e logs num SDK só.
 *
 * ┌─ REGRA DE OURO ──────────────────────────────────────────────────────────┐
 * │ Este módulo DEVE ser o primeiro import de src/index.ts. Dois motivos:    │
 * │                                                                          │
 * │ 1. As instrumentações só conseguem instrumentar módulos que ainda NÃO    │
 * │    foram carregados (require-in-the-middle). Se `express`/`http` forem   │
 * │    carregados antes, o tracing HTTP simplesmente não existe.             │
 * │ 2. `metrics.getMeter()` resolve o provider global NO MOMENTO DO IMPORT   │
 * │    (diferente de traces, que usam um proxy). Se `metrics.ts` carregar    │
 * │    antes de `sdk.start()`, TODOS os instrumentos viram no-op — sem erro, │
 * │    sem aviso, sem métrica no Prometheus.                                 │
 * │                                                                          │
 * │ Corolário: este arquivo não pode importar metrics.ts, prisma.ts,         │
 * │ app.ts nem logger.ts.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ver docs/observabilidade.md e docs/decisoes/0007-observabilidade.md.
 */

// O .env deste projeto só é lido como efeito colateral do @prisma/client, que
// carrega DEPOIS deste bootstrap. Sem esta linha, as OTEL_* do .env seriam
// invisíveis aqui e o endpoint cairia sempre no default.
// Importar '@prisma/client' aqui para resolver isso seria pior: carregaria
// `http` antes das instrumentações e mataria o tracing HTTP.
import 'dotenv/config';

import type { IncomingMessage } from 'node:http';

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { AggregationType, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { ViewOptions } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const DESLIGADO =
  process.env['NODE_ENV'] === 'test' || process.env['OTEL_SDK_DISABLED'] === 'true';

const ENDPOINT = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317';
const INTERVALO_EXPORT_MS = Number(process.env['OTEL_METRIC_EXPORT_INTERVAL'] ?? 15_000);

/**
 * Fronteiras (em SEGUNDOS) alinhadas aos alvos de latência do PRD:
 *   0.3 → RNF-1  GET /books/:id            < 300 ms
 *   0.5 → RNF-4  GET /me/reservations|loans < 500 ms
 *   3   → RNF-2/3 POST /reservations, POST /loans, PATCH /loans/:id/return < 3 s
 *
 * Ter o limite EXATO como fronteira é o que permite calcular "% de requisições
 * dentro do alvo" sem erro de interpolação. Os defaults do OTel pulam de 0,25
 * para 0,5 — o que erraria o RNF-1 por 50 ms.
 */
const FRONTEIRAS_SLO_HTTP = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10];

const views: ViewOptions[] = [
  {
    // Instrumento criado pelo instrumentation-http (semconv estável, unidade "s").
    instrumentName: 'http.server.request.duration',
    aggregation: {
      type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
      options: { boundaries: FRONTEIRAS_SLO_HTTP },
    },
  },
];

let sdk: NodeSDK | undefined;

if (!DESLIGADO) {
  // Diagnóstico do próprio SDK — a resposta para "liguei tudo e não chega nada".
  if (process.env['OTEL_DIAG'] === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'biblioteca-api',
        [ATTR_SERVICE_VERSION]: process.env['OTEL_SERVICE_VERSION'] ?? '0.0.0',
        // Literal em vez do import: o subpath /incubating do pacote
        // semantic-conventions não resolve sob moduleResolution "node10".
        'deployment.environment.name': process.env['NODE_ENV'] ?? 'development',
      }),
    ),

    traceExporter: new OTLPTraceExporter({ url: ENDPOINT }),

    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: ENDPOINT }),
        exportIntervalMillis: INTERVALO_EXPORT_MS,
      }),
    ],

    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: ENDPOINT }) }),
    ],

    views,

    // Instrumentações explícitas em vez de auto-instrumentations-node: o Prisma
    // fala com o Postgres por um engine Rust, então instrumentation-pg não
    // captaria nada, e o resto do pacote (aws, kafka, redis, graphql…) seria
    // peso morto no npm ci. Spans de banco vêm da extensão em infra/prisma.ts.
    instrumentations: [
      new HttpInstrumentation({
        // /health é batido em laço pelo healthcheck do compose e pelo webServer
        // do Playwright — ruído puro no Jaeger.
        ignoreIncomingRequestHook: (req: IncomingMessage): boolean =>
          (req.url ?? '').startsWith('/health'),
      }),
      new ExpressInstrumentation({
        // Um span por middleware (cors, json, cookieParser, authenticate…)
        // triplica o tamanho do trace sem acrescentar informação.
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      }),
      new PinoInstrumentation({
        disableLogCorrelation: false, // injeta trace_id/span_id no log
        disableLogSending: false, // envia o mesmo registro por OTLP ao Graylog
      }),
      // Heap, event loop lag e GC — o painel de runtime do dashboard de saúde.
      new RuntimeNodeInstrumentation(),
    ],
  });

  sdk.start(); // síncrono: ao retornar, os providers globais já estão registrados
}

/** Faz o flush de spans/métricas/logs pendentes no graceful shutdown. */
export function shutdownTelemetry(): Promise<void> {
  return sdk ? sdk.shutdown() : Promise.resolve();
}
