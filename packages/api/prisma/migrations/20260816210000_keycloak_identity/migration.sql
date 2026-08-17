-- Keycloak passa a ser o provedor de identidade (ADR-0009).
--
-- A credencial sai do nosso banco: quem guarda senha e emite token é o realm.
-- `users` vira o espelho local da identidade, ligado ao Keycloak por externalId
-- (o `sub` do token), preenchido sob demanda no primeiro acesso.

-- AddColumn: nulo primeiro para poder preencher as linhas que já existem
ALTER TABLE "users" ADD COLUMN "externalId" TEXT;

-- Backfill: linhas anteriores ao Keycloak recebem o próprio id como externalId.
-- É um valor único e estável, o bastante para a coluna virar NOT NULL sem perder
-- linha. O seed reescreve os três usuários de desenvolvimento com os UUIDs do
-- realm (keycloak/realm-biblioteca.json).
UPDATE "users" SET "externalId" = "id" WHERE "externalId" IS NULL;

-- AlterColumn
ALTER TABLE "users" ALTER COLUMN "externalId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_externalId_key" ON "users"("externalId");

-- DropColumn: hash de senha sem ninguém escrevendo nele é material de credencial
-- obsoleto. Ver docs/seguranca.md.
ALTER TABLE "users" DROP COLUMN "passwordHash";

-- DropTable: a rotação de refresh token passa a ser do Keycloak.
DROP TABLE "refresh_tokens";
