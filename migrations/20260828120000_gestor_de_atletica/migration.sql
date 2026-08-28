-- Responsavel de atletica: um papel que alcanca uma equipe so.
--
-- Os dois papeis existentes se prendem a edicao inteira (EDITION_ADMIN) ou a
-- uma modalidade (DISCIPLINE_MANAGER). Nenhum deles descreve "cuida apenas da
-- minha equipe", que e o que as atleticas precisam para montar o proprio
-- elenco sem enxergar nem alterar o das rivais.
--
-- `teamId` fica nulo nos outros papeis: eles nao se prendem a equipe nenhuma,
-- e obrigar um valor ali seria inventar um vinculo que nao existe.
ALTER TYPE "EditionStaffRoleType" ADD VALUE 'TEAM_MANAGER';

ALTER TABLE "edition_staff_roles"
ADD COLUMN "teamId" TEXT;

ALTER TABLE "edition_staff_roles"
ADD CONSTRAINT "edition_staff_roles_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "edition_staff_roles_editionId_teamId_revokedAt_idx"
ON "edition_staff_roles"("editionId", "teamId", "revokedAt");
