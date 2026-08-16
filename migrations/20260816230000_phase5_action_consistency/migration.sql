ALTER TABLE "matches"
ALTER COLUMN "scoreA" TYPE DOUBLE PRECISION
USING "scoreA"::double precision,
ALTER COLUMN "scoreB" TYPE DOUBLE PRECISION
USING "scoreB"::double precision;

ALTER TABLE "match_events"
ALTER COLUMN "scoreA" TYPE DOUBLE PRECISION
USING "scoreA"::double precision,
ALTER COLUMN "scoreB" TYPE DOUBLE PRECISION
USING "scoreB"::double precision;

ALTER TABLE "phase_standings"
ALTER COLUMN "scoreFor" TYPE DOUBLE PRECISION
USING "scoreFor"::double precision,
ALTER COLUMN "scoreAgainst" TYPE DOUBLE PRECISION
USING "scoreAgainst"::double precision,
ALTER COLUMN "points" TYPE DOUBLE PRECISION
USING "points"::double precision;

CREATE INDEX "edition_action_receipts_idempotencyKey_createdAt_idx"
ON "edition_action_receipts"("idempotencyKey", "createdAt");
