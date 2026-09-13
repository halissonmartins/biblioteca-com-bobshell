-- Cancelamento de Reserva pelo Leitor (RF-L8, RN-11) — issue #20
--
-- Até aqui a Reserva tinha duas saídas: conversão em Empréstimo ("convertedAt")
-- e expiração das 12h de RN-1, que o job de fundo registrava em "cancelledAt".
-- Com o cancelamento pelo Leitor existindo, um campo só não distingue "o prazo
-- passou" de "o Leitor desistiu" — e são conclusões opostas para o balcão e para
-- a métrica de produto.
--
-- "cancelledAt" passa a significar EXCLUSIVAMENTE cancelamento pelo Leitor, e a
-- expiração muda para "expiredAt". Toda linha existente com "cancelledAt"
-- preenchida é, por construção, uma expiração: o produto não tinha cancelamento
-- (era o que o glossário registrava em "Reserva expirada"), então o backfill é
-- exato, não uma aproximação.

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "expiredAt" TIMESTAMP(3);

-- Backfill: o que estava marcado como cancelado só podia ser expiração
UPDATE "reservations"
   SET "expiredAt" = "cancelledAt",
       "cancelledAt" = NULL
 WHERE "cancelledAt" IS NOT NULL;

-- O job varre por prazo vencido e ainda sem desfecho; o índice de "expiresAt"
-- já existe e continua servindo. Este cobre a leitura no sentido oposto — as
-- Reservas que o Leitor cancelou, que é o que a métrica de desistência lê.
-- CreateIndex
CREATE INDEX "reservations_cancelledAt_idx" ON "reservations"("cancelledAt");
