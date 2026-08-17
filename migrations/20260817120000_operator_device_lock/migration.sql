ALTER TABLE "matches"
ADD COLUMN "operatorDeviceId" TEXT;

DROP INDEX "matches_operatorId_operatorHeartbeat_idx";

CREATE INDEX "matches_operatorId_operatorDeviceId_operatorHeartbeat_idx"
ON "matches"("operatorId", "operatorDeviceId", "operatorHeartbeat");
