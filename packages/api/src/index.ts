/**
 * packages/api/src/index.ts
 * Ponto de entrada: cria a app e chama listen() com graceful shutdown.
 */

// ⚠️ PRIMEIRO IMPORT, sempre. As instrumentações só conseguem instrumentar
// módulos ainda não carregados, e os instrumentos de métrica resolvem o
// provider no momento do import. Ver REGRA DE OURO em infra/telemetry/otel.ts.
import { shutdownTelemetry } from './infra/telemetry/otel.js';

import { createApp } from './api/app.js';
import { prisma } from './infra/prisma.js';
import { startExpireReservationsJob } from './infra/jobs/expireReservations.js';
import { expireReservationsTx } from './infra/repositories/reservationRepository.js';
import { registrarGaugesDeNegocio } from './infra/telemetry/businessGauges.js';
import { logger } from './shared/logger.js';

const PORT = Number(process.env['PORT'] ?? 3000);

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `API rodando em http://localhost:${String(PORT)}`);
});

// Job de expiração de Reservas — RN-1, RN-5
const expiryJob = startExpireReservationsJob({ expireReservationsTx });

// Gauges de estado do acervo — consultam o banco a cada coleta, por isso só no
// processo servidor (nunca em app.ts, que os testes importam).
registrarGaugesDeNegocio();

// Graceful shutdown — para o job e aguarda conexões abertas encerrarem
function shutdown(): void {
  expiryJob.stop();
  server.close(() => {
    void prisma
      .$disconnect()
      // Flush do último lote de spans/métricas/logs ANTES de sair.
      .then(() => shutdownTelemetry())
      .then(() => {
        logger.info('API encerrada.');
        process.exit(0);
      });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
