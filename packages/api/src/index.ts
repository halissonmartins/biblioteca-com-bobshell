/**
 * packages/api/src/index.ts
 * Ponto de entrada: cria a app e chama listen() com graceful shutdown.
 */

import { createApp } from './api/app.js';
import { prisma } from './infra/prisma.js';
import { startExpireReservationsJob } from './infra/jobs/expireReservations.js';
import { expireReservationsTx } from './infra/repositories/reservationRepository.js';

const PORT = Number(process.env['PORT'] ?? 3000);

const app = createApp();

const server = app.listen(PORT, () => {
  console.info(`API rodando em http://localhost:${String(PORT)}`);
});

// Job de expiração de Reservas — RN-1, RN-5
const expiryJob = startExpireReservationsJob({ expireReservationsTx });

// Graceful shutdown — para o job e aguarda conexões abertas encerrarem
function shutdown(): void {
  expiryJob.stop();
  server.close(() => {
    void prisma.$disconnect().then(() => {
      console.info('API encerrada.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
