-- CreateEnum
CREATE TYPE "MatchEventSide" AS ENUM ('HOME', 'AWAY', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "OverallPosition" AS ENUM ('CHAMPION', 'RUNNER_UP', 'THIRD', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "OverallAwardOrigin" AS ENUM ('MANUAL', 'AUTOMATIC');

-- DropForeignKey
ALTER TABLE "edition_staff_roles" DROP CONSTRAINT "edition_staff_roles_editionDisciplineId_fkey";

-- DropIndex
-- The legacy nullable composite key neither prevents duplicate edition admins
-- nor permits historical role rows after revocation.
DROP INDEX "edition_staff_roles_editionId_staffId_editionDisciplineId_r_key";

-- AlterTable
ALTER TABLE "competitions" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "competition_editions" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initials" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "responsible" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "athletes" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "document" DROP NOT NULL;

-- AlterTable
ALTER TABLE "edition_staff_roles" ADD COLUMN     "revokedAt" TIMESTAMPTZ(3),
ADD COLUMN     "revokedById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "config" JSONB;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "clockSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentPeriod" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "operatorHeartbeat" TIMESTAMPTZ(3),
ADD COLUMN     "operatorId" TEXT,
ADD COLUMN     "operatorName" TEXT,
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "periodScoreA" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "periodScoreB" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "runningSince" TIMESTAMPTZ(3),
ADD COLUMN     "startNote" TEXT,
ADD COLUMN     "startedAt" TIMESTAMPTZ(3),
ADD COLUMN     "startedById" TEXT,
ADD COLUMN     "tiebreak" JSONB,
ADD COLUMN     "walkoverWinnerEntryId" TEXT;

-- AlterTable
ALTER TABLE "match_events" ADD COLUMN     "detail" TEXT,
ADD COLUMN     "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "period" INTEGER,
ADD COLUMN     "periodElapsedSeconds" INTEGER,
ADD COLUMN     "points" INTEGER,
ADD COLUMN     "previousScore" JSONB,
ADD COLUMN     "scoreA" INTEGER,
ADD COLUMN     "scoreB" INTEGER,
ADD COLUMN     "side" "MatchEventSide" NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN     "undoneAt" TIMESTAMPTZ(3),
ADD COLUMN     "undoneById" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "edition_teams" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition_athletes" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "teamId" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_period_results" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_period_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_corrections" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_metrics" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultPoints" INTEGER NOT NULL,
    "position" "OverallPosition",
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overall_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_awards" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "editionDisciplineId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "origin" "OverallAwardOrigin" NOT NULL DEFAULT 'MANUAL',
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" TEXT,
    "revokedByName" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overall_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overall_closures" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "note" TEXT,
    "closedAt" TIMESTAMPTZ(3) NOT NULL,
    "reopenedAt" TIMESTAMPTZ(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overall_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "editionId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "rotatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition_action_receipts" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultRevision" INTEGER NOT NULL,
    "responseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_action_receipts_pkey" PRIMARY KEY ("id")
);

-- Backfill legacy rows before adding scope constraints.
-- The edition is selected first. Its parent competition then becomes the active
-- competition, so the two active contexts can never point at different trees.
WITH chosen_edition AS (
  SELECT "id"
  FROM "competition_editions"
  ORDER BY
    CASE "status" WHEN 'ONGOING' THEN 0 WHEN 'PLANNING' THEN 1 WHEN 'FINISHED' THEN 2 ELSE 3 END,
    "startDate" DESC,
    "id"
  LIMIT 1
)
UPDATE "competition_editions" AS edition
SET "isActive" = edition."id" = (SELECT "id" FROM chosen_edition);

WITH chosen_competition AS (
  SELECT COALESCE(
    (
      SELECT edition."competitionId"
      FROM "competition_editions" AS edition
      WHERE edition."isActive" = true
      LIMIT 1
    ),
    (
      SELECT competition."id"
      FROM "competitions" AS competition
      ORDER BY competition."createdAt" DESC, competition."id"
      LIMIT 1
    )
  ) AS "id"
)
UPDATE "competitions" AS competition
SET "isActive" = competition."id" = (SELECT "id" FROM chosen_competition);

-- A role belongs to the edition of its discipline. The obsolete unique index
-- was dropped before this repair so converging legacy rows cannot collide.
UPDATE "edition_staff_roles" AS role
SET "editionId" = discipline."editionId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "edition_disciplines" AS discipline
WHERE role."editionDisciplineId" = discipline."id"
  AND role."editionId" <> discipline."editionId";

DO $$
DECLARE
  invalid_roles TEXT;
BEGIN
  SELECT string_agg(role."id", ', ' ORDER BY role."id")
  INTO invalid_roles
  FROM "edition_staff_roles" AS role
  WHERE
    (role."role" = 'EDITION_ADMIN' AND role."editionDisciplineId" IS NOT NULL)
    OR
    (role."role" = 'DISCIPLINE_MANAGER' AND role."editionDisciplineId" IS NULL);

  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: papÃ©is legados possuem escopo incompatÃ­vel',
      DETAIL = 'edition_staff_roles ids: ' || invalid_roles,
      HINT = 'EDITION_ADMIN exige editionDisciplineId NULL; DISCIPLINE_MANAGER exige uma modalidade da mesma ediÃ§Ã£o.';
  END IF;
END $$;

-- Preserve one active logical assignment and revoke only duplicate legacy rows.
WITH duplicate_roles AS (
  SELECT role."id", ROW_NUMBER() OVER (
    PARTITION BY role."editionId", role."staffId", role."editionDisciplineId", role."role"
    ORDER BY role."createdAt" DESC, role."id" DESC
  ) AS row_number
  FROM "edition_staff_roles" AS role
  WHERE role."revokedAt" IS NULL
)
UPDATE "edition_staff_roles" AS role
SET "revokedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
FROM duplicate_roles AS duplicate
WHERE duplicate."id" = role."id" AND duplicate.row_number > 1;

INSERT INTO "edition_teams" ("id", "editionId", "teamId", "archived", "createdAt", "updatedAt")
SELECT
  'legacy-edition-team-' || md5(link."editionId" || ':' || link."teamId"),
  link."editionId",
  link."teamId",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT discipline."editionId", roster."teamId"
  FROM "edition_rosters" AS roster
  JOIN "edition_disciplines" AS discipline ON discipline."id" = roster."editionDisciplineId"
  WHERE roster."teamId" IS NOT NULL
  UNION
  SELECT DISTINCT discipline."editionId", entry."teamId"
  FROM "tournament_entries" AS entry
  JOIN "tournaments" AS tournament ON tournament."id" = entry."tournamentId"
  JOIN "edition_disciplines" AS discipline ON discipline."id" = tournament."editionDisciplineId"
  WHERE entry."teamId" IS NOT NULL
) AS link;

DO $$
DECLARE
  conflicting_athletes TEXT;
BEGIN
  SELECT string_agg(
    conflict."editionId" || '/' || conflict."athleteId" || '=[' || conflict.team_ids || ']',
    '; ' ORDER BY conflict."editionId", conflict."athleteId"
  )
  INTO conflicting_athletes
  FROM (
    SELECT
      discipline."editionId",
      roster."athleteId",
      string_agg(DISTINCT roster."teamId", ',' ORDER BY roster."teamId") AS team_ids
    FROM "edition_rosters" AS roster
    JOIN "edition_disciplines" AS discipline ON discipline."id" = roster."editionDisciplineId"
    WHERE roster."teamId" IS NOT NULL
    GROUP BY discipline."editionId", roster."athleteId"
    HAVING COUNT(DISTINCT roster."teamId") > 1
  ) AS conflict;

  IF conflicting_athletes IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: atleta legado vinculado a mÃºltiplas equipes na mesma ediÃ§Ã£o',
      DETAIL = conflicting_athletes,
      HINT = 'Corrija os elencos conflitantes antes de reaplicar a migraÃ§Ã£o.';
  END IF;
END $$;

WITH athlete_identities AS (
  SELECT DISTINCT discipline."editionId", roster."athleteId"
  FROM "edition_rosters" AS roster
  JOIN "edition_disciplines" AS discipline ON discipline."id" = roster."editionDisciplineId"
  UNION
  SELECT DISTINCT discipline."editionId", entry."athleteId"
  FROM "tournament_entries" AS entry
  JOIN "tournaments" AS tournament ON tournament."id" = entry."tournamentId"
  JOIN "edition_disciplines" AS discipline ON discipline."id" = tournament."editionDisciplineId"
  WHERE entry."athleteId" IS NOT NULL
), athlete_team AS (
  SELECT DISTINCT discipline."editionId", roster."athleteId", roster."teamId"
  FROM "edition_rosters" AS roster
  JOIN "edition_disciplines" AS discipline ON discipline."id" = roster."editionDisciplineId"
  WHERE roster."teamId" IS NOT NULL
)
INSERT INTO "edition_athletes" ("id", "editionId", "athleteId", "teamId", "removed", "createdAt", "updatedAt")
SELECT
  'legacy-edition-athlete-' || md5(identity."editionId" || ':' || identity."athleteId"),
  identity."editionId",
  identity."athleteId",
  team."teamId",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM athlete_identities AS identity
LEFT JOIN athlete_team AS team
  ON team."editionId" = identity."editionId"
 AND team."athleteId" = identity."athleteId";

-- Defaults were temporary so existing rows could receive a timestamp while
-- the columns were introduced. Prisma's @updatedAt owns future writes.
ALTER TABLE "teams" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "athletes" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "edition_staff_roles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "edition_teams_editionId_archived_idx" ON "edition_teams"("editionId", "archived");

-- CreateIndex
CREATE INDEX "edition_teams_teamId_idx" ON "edition_teams"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "edition_teams_editionId_teamId_key" ON "edition_teams"("editionId", "teamId");

-- CreateIndex
CREATE INDEX "edition_athletes_editionId_removed_idx" ON "edition_athletes"("editionId", "removed");

-- CreateIndex
CREATE INDEX "edition_athletes_athleteId_idx" ON "edition_athletes"("athleteId");

-- CreateIndex
CREATE INDEX "edition_athletes_editionId_teamId_idx" ON "edition_athletes"("editionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "edition_athletes_editionId_athleteId_key" ON "edition_athletes"("editionId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "match_period_results_matchId_period_key" ON "match_period_results"("matchId", "period");

-- CreateIndex
CREATE INDEX "match_corrections_matchId_createdAt_idx" ON "match_corrections"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "match_corrections_actorId_idx" ON "match_corrections"("actorId");

-- CreateIndex
CREATE INDEX "overall_metrics_editionId_removedAt_idx" ON "overall_metrics"("editionId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "overall_metrics_editionId_clientId_key" ON "overall_metrics"("editionId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "overall_metrics_editionId_name_key" ON "overall_metrics"("editionId", "name");

-- CreateIndex
CREATE INDEX "overall_awards_editionId_createdAt_idx" ON "overall_awards"("editionId", "createdAt");

-- CreateIndex
CREATE INDEX "overall_awards_editionId_teamId_revokedAt_idx" ON "overall_awards"("editionId", "teamId", "revokedAt");

-- CreateIndex
CREATE INDEX "overall_awards_editionId_editionDisciplineId_idx" ON "overall_awards"("editionId", "editionDisciplineId");

-- CreateIndex
CREATE INDEX "overall_awards_editionId_metricId_idx" ON "overall_awards"("editionId", "metricId");

-- CreateIndex
CREATE INDEX "overall_awards_revokedById_idx" ON "overall_awards"("revokedById");

-- CreateIndex
CREATE INDEX "overall_closures_editionId_reopenedAt_idx" ON "overall_closures"("editionId", "reopenedAt");

-- CreateIndex
CREATE INDEX "overall_closures_actorId_idx" ON "overall_closures"("actorId");

-- CreateIndex
CREATE INDEX "overall_closures_reopenedById_idx" ON "overall_closures"("reopenedById");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_rotatedFromId_key" ON "refresh_sessions"("rotatedFromId");

-- CreateIndex
CREATE INDEX "refresh_sessions_staffId_revokedAt_expiresAt_idx" ON "refresh_sessions"("staffId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_editionId_idx" ON "refresh_sessions"("editionId");

-- CreateIndex
CREATE INDEX "edition_action_receipts_editionId_createdAt_idx" ON "edition_action_receipts"("editionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "edition_action_receipts_editionId_idempotencyKey_key" ON "edition_action_receipts"("editionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "competitions_isActive_idx" ON "competitions"("isActive");

-- CreateIndex
CREATE INDEX "competition_editions_isActive_idx" ON "competition_editions"("isActive");

-- CreateIndex
CREATE INDEX "teams_archived_name_idx" ON "teams"("archived", "name");

-- CreateIndex
CREATE UNIQUE INDEX "edition_disciplines_editionId_id_key" ON "edition_disciplines"("editionId", "id");

-- CreateIndex
CREATE INDEX "edition_staff_roles_editionId_revokedAt_idx" ON "edition_staff_roles"("editionId", "revokedAt");

-- CreateIndex
CREATE INDEX "edition_staff_roles_editionId_staffId_editionDisciplineId_r_idx" ON "edition_staff_roles"("editionId", "staffId", "editionDisciplineId", "role", "revokedAt");

-- CreateIndex
CREATE INDEX "edition_staff_roles_revokedById_idx" ON "edition_staff_roles"("revokedById");

-- CreateIndex
CREATE INDEX "matches_operatorId_operatorHeartbeat_idx" ON "matches"("operatorId", "operatorHeartbeat");

-- CreateIndex
CREATE INDEX "matches_walkoverWinnerEntryId_idx" ON "matches"("walkoverWinnerEntryId");

-- CreateIndex
CREATE INDEX "match_events_matchId_undoneAt_idx" ON "match_events"("matchId", "undoneAt");

-- CreateIndex
CREATE INDEX "match_events_undoneById_idx" ON "match_events"("undoneById");

-- CreateIndex
CREATE INDEX "audit_logs_editionId_action_createdAt_idx" ON "audit_logs"("editionId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "edition_teams" ADD CONSTRAINT "edition_teams_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_teams" ADD CONSTRAINT "edition_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_athletes" ADD CONSTRAINT "edition_athletes_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_athletes" ADD CONSTRAINT "edition_athletes_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_athletes" ADD CONSTRAINT "edition_athletes_editionId_teamId_fkey" FOREIGN KEY ("editionId", "teamId") REFERENCES "edition_teams"("editionId", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_staff_roles" ADD CONSTRAINT "edition_staff_roles_editionId_editionDisciplineId_fkey" FOREIGN KEY ("editionId", "editionDisciplineId") REFERENCES "edition_disciplines"("editionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_staff_roles" ADD CONSTRAINT "edition_staff_roles_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_walkoverWinnerEntryId_fkey" FOREIGN KEY ("walkoverWinnerEntryId") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_undoneById_fkey" FOREIGN KEY ("undoneById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_period_results" ADD CONSTRAINT "match_period_results_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_corrections" ADD CONSTRAINT "match_corrections_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_corrections" ADD CONSTRAINT "match_corrections_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_metrics" ADD CONSTRAINT "overall_metrics_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_awards" ADD CONSTRAINT "overall_awards_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_awards" ADD CONSTRAINT "overall_awards_editionId_teamId_fkey" FOREIGN KEY ("editionId", "teamId") REFERENCES "edition_teams"("editionId", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_awards" ADD CONSTRAINT "overall_awards_editionId_editionDisciplineId_fkey" FOREIGN KEY ("editionId", "editionDisciplineId") REFERENCES "edition_disciplines"("editionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_awards" ADD CONSTRAINT "overall_awards_editionId_metricId_fkey" FOREIGN KEY ("editionId", "metricId") REFERENCES "overall_metrics"("editionId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_awards" ADD CONSTRAINT "overall_awards_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_closures" ADD CONSTRAINT "overall_closures_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_closures" ADD CONSTRAINT "overall_closures_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overall_closures" ADD CONSTRAINT "overall_closures_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_action_receipts" ADD CONSTRAINT "edition_action_receipts_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Contract invariants not expressible by Prisma schema syntax.
CREATE UNIQUE INDEX "competitions_one_active_key"
ON "competitions" (("isActive"))
WHERE "isActive" = true;

CREATE UNIQUE INDEX "competition_editions_one_active_key"
ON "competition_editions" (("isActive"))
WHERE "isActive" = true;

CREATE UNIQUE INDEX "edition_staff_roles_active_admin_key"
ON "edition_staff_roles" ("editionId", "staffId", "role")
WHERE "editionDisciplineId" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "edition_staff_roles_active_discipline_key"
ON "edition_staff_roles" ("editionId", "staffId", "editionDisciplineId", "role")
WHERE "editionDisciplineId" IS NOT NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "overall_closures_one_active_per_edition_key"
ON "overall_closures" ("editionId")
WHERE "reopenedAt" IS NULL;

-- Fail with actionable diagnostics instead of leaving unvalidated constraints.
DO $$
DECLARE
  invalid_ids TEXT;
BEGIN
  SELECT string_agg(entry."id", ', ' ORDER BY entry."id")
  INTO invalid_ids
  FROM "tournament_entries" AS entry
  WHERE num_nonnulls(entry."teamId", entry."athleteId") <> 1;

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: participante legado inválido',
      DETAIL = 'tournament_entries ids: ' || invalid_ids,
      HINT = 'Cada participante deve apontar para exatamente uma equipe ou um atleta.';
  END IF;

  SELECT string_agg(match."id", ', ' ORDER BY match."id")
  INTO invalid_ids
  FROM "matches" AS match
  WHERE match."winnerEntryId" IS NOT NULL
    AND match."winnerEntryId" IS DISTINCT FROM match."entryAId"
    AND match."winnerEntryId" IS DISTINCT FROM match."entryBId";

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: vencedor legado não participa da partida',
      DETAIL = 'matches ids: ' || invalid_ids,
      HINT = 'winnerEntryId deve ser entryAId ou entryBId, ambos não nulos quando escolhidos.';
  END IF;

  SELECT string_agg(match."id", ', ' ORDER BY match."id")
  INTO invalid_ids
  FROM "matches" AS match
  WHERE match."walkoverWinnerEntryId" IS NOT NULL
    AND match."walkoverWinnerEntryId" IS DISTINCT FROM match."entryAId"
    AND match."walkoverWinnerEntryId" IS DISTINCT FROM match."entryBId";

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: vencedor de W.O. legado não participa da partida',
      DETAIL = 'matches ids: ' || invalid_ids,
      HINT = 'walkoverWinnerEntryId deve ser entryAId ou entryBId, ambos não nulos quando escolhidos.';
  END IF;

  SELECT string_agg(match."id", ', ' ORDER BY match."id")
  INTO invalid_ids
  FROM "matches" AS match
  WHERE match."currentPeriod" < 1
     OR match."clockSeconds" < 0
     OR match."periodScoreA" < 0
     OR match."periodScoreB" < 0;

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'integration_contract: runtime legado de partida possui valores negativos',
      DETAIL = 'matches ids: ' || invalid_ids,
      HINT = 'Corrija período, relógio e placares parciais antes de reaplicar a migração.';
  END IF;
END $$;

ALTER TABLE "edition_staff_roles"
ADD CONSTRAINT "edition_staff_roles_scope_check"
CHECK (
  ("role" = 'EDITION_ADMIN' AND "editionDisciplineId" IS NULL)
  OR
  ("role" = 'DISCIPLINE_MANAGER' AND "editionDisciplineId" IS NOT NULL)
);

ALTER TABLE "tournament_entries"
ADD CONSTRAINT "tournament_entries_exactly_one_participant_check"
CHECK (num_nonnulls("teamId", "athleteId") = 1);

ALTER TABLE "matches"
ADD CONSTRAINT "matches_winner_is_participant_check"
CHECK (
  "winnerEntryId" IS NULL
  OR ("entryAId" IS NOT NULL AND "winnerEntryId" = "entryAId")
  OR ("entryBId" IS NOT NULL AND "winnerEntryId" = "entryBId")
),
ADD CONSTRAINT "matches_walkover_winner_is_participant_check"
CHECK (
  "walkoverWinnerEntryId" IS NULL
  OR ("entryAId" IS NOT NULL AND "walkoverWinnerEntryId" = "entryAId")
  OR ("entryBId" IS NOT NULL AND "walkoverWinnerEntryId" = "entryBId")
),
ADD CONSTRAINT "matches_runtime_non_negative_check"
CHECK ("currentPeriod" >= 1 AND "clockSeconds" >= 0 AND "periodScoreA" >= 0 AND "periodScoreB" >= 0);

ALTER TABLE "match_period_results"
ADD CONSTRAINT "match_period_results_non_negative_check"
CHECK ("period" >= 1 AND "scoreA" >= 0 AND "scoreB" >= 0);

ALTER TABLE "overall_awards"
ADD CONSTRAINT "overall_awards_revocation_complete_check"
CHECK (
  ("revokedAt" IS NULL AND "revokeReason" IS NULL)
  OR
  ("revokedAt" IS NOT NULL AND "revokeReason" IS NOT NULL AND ("revokedById" IS NOT NULL OR "revokedByName" IS NOT NULL))
);

ALTER TABLE "overall_closures"
ADD CONSTRAINT "overall_closures_reopening_complete_check"
CHECK (
  ("reopenedAt" IS NULL AND "reopenReason" IS NULL)
  OR
  ("reopenedAt" IS NOT NULL AND "reopenReason" IS NOT NULL)
);
