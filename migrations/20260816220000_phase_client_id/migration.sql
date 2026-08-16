-- Add the frontend-scoped phase identifier without changing internal primary
-- keys or any relation that already points to phases.id.
ALTER TABLE "phases" ADD COLUMN "clientId" TEXT;

-- Existing phase IDs were globally unique and are therefore a deterministic,
-- lossless initial client identifier inside each tournament.
UPDATE "phases"
SET "clientId" = "id"
WHERE "clientId" IS NULL;

DO $$
DECLARE
  null_phase_ids TEXT;
  duplicate_scopes TEXT;
BEGIN
  SELECT string_agg(phase."id", ', ' ORDER BY phase."id")
  INTO null_phase_ids
  FROM "phases" AS phase
  WHERE phase."clientId" IS NULL;

  IF null_phase_ids IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'phase_client_id: fases sem clientId após o backfill',
      DETAIL = 'phase ids: ' || null_phase_ids,
      HINT = 'Corrija os registros indicados antes de reaplicar a migração.';
  END IF;

  SELECT string_agg(
    duplicate."tournamentId" || '/' || duplicate."clientId" || '=[' || duplicate.phase_ids || ']',
    '; ' ORDER BY duplicate."tournamentId", duplicate."clientId"
  )
  INTO duplicate_scopes
  FROM (
    SELECT
      phase."tournamentId",
      phase."clientId",
      string_agg(phase."id", ',' ORDER BY phase."id") AS phase_ids
    FROM "phases" AS phase
    GROUP BY phase."tournamentId", phase."clientId"
    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF duplicate_scopes IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'phase_client_id: clientId duplicado no mesmo torneio',
      DETAIL = duplicate_scopes,
      HINT = 'Atribua um clientId distinto a cada fase do torneio antes de reaplicar a migração.';
  END IF;
END $$;

ALTER TABLE "phases" ALTER COLUMN "clientId" SET NOT NULL;

CREATE UNIQUE INDEX "phases_tournamentId_clientId_key"
ON "phases"("tournamentId", "clientId");
