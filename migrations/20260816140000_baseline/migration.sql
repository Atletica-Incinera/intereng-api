-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('PLANNING', 'ONGOING', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION', 'GROUP_KNOCKOUT', 'LEAGUE_KNOCKOUT', 'LEAGUE_ONLY', 'LEAGUE_LIMITED_KNOCKOUT');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ONGOING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PhaseType" AS ENUM ('GROUP', 'LEAGUE', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'WALKOVER', 'CANCELLED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('ACTIVE', 'INJURED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EditionStaffRoleType" AS ENUM ('EDITION_ADMIN', 'DISCIPLINE_MANAGER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'POINT', 'SET_WON', 'FOUL', 'TIMEOUT_CALLED', 'SUBSTITUTION', 'DISQUALIFICATION', 'CHECKMATE', 'WALKOVER_DECLARED', 'OTHER');

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_editions" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3) NOT NULL,
    "status" "EditionStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isIndividual" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athletes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "birthDate" DATE,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition_disciplines" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edition_disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition_rosters" (
    "id" TEXT NOT NULL,
    "editionDisciplineId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "teamId" TEXT,
    "jerseyNumber" INTEGER,
    "status" "RosterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edition_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edition_staff_roles" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "editionDisciplineId" TEXT,
    "role" "EditionStaffRoleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edition_staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "editionDisciplineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "TournamentFormat" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_entries" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT,
    "athleteId" TEXT,
    "seed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phases" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PhaseType" NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_entries" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,

    CONSTRAINT "group_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "groupId" TEXT,
    "round" INTEGER,
    "bracketSlot" INTEGER,
    "entryAId" TEXT,
    "entryBId" TEXT,
    "winnerEntryId" TEXT,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "lastEventSequence" INTEGER NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMPTZ(3),
    "venue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "entryId" TEXT,
    "athleteId" TEXT,
    "type" "EventType" NOT NULL,
    "metadata" JSONB,
    "sequence" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_standings" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "scoreFor" INTEGER NOT NULL DEFAULT 0,
    "scoreAgainst" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase_standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "editionId" TEXT,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions"("slug");

-- CreateIndex
CREATE INDEX "competition_editions_competitionId_status_idx" ON "competition_editions"("competitionId", "status");

-- CreateIndex
CREATE INDEX "competition_editions_status_startDate_idx" ON "competition_editions"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "competition_editions_competitionId_year_key" ON "competition_editions"("competitionId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_slug_key" ON "disciplines"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_document_key" ON "athletes"("document");

-- CreateIndex
CREATE INDEX "athletes_name_idx" ON "athletes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "edition_disciplines_editionId_disciplineId_key" ON "edition_disciplines"("editionId", "disciplineId");

-- CreateIndex
CREATE INDEX "edition_rosters_teamId_idx" ON "edition_rosters"("teamId");

-- CreateIndex
CREATE INDEX "edition_rosters_athleteId_idx" ON "edition_rosters"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "edition_rosters_editionDisciplineId_athleteId_key" ON "edition_rosters"("editionDisciplineId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "edition_staff_roles_editionId_staffId_editionDisciplineId_r_key" ON "edition_staff_roles"("editionId", "staffId", "editionDisciplineId", "role");

-- CreateIndex
CREATE INDEX "tournaments_editionDisciplineId_status_idx" ON "tournaments"("editionDisciplineId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_editionDisciplineId_name_key" ON "tournaments"("editionDisciplineId", "name");

-- CreateIndex
CREATE INDEX "tournament_entries_tournamentId_idx" ON "tournament_entries"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_entries_teamId_idx" ON "tournament_entries"("teamId");

-- CreateIndex
CREATE INDEX "tournament_entries_athleteId_idx" ON "tournament_entries"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entries_tournamentId_teamId_key" ON "tournament_entries"("tournamentId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entries_tournamentId_athleteId_key" ON "tournament_entries"("tournamentId", "athleteId");

-- CreateIndex
CREATE INDEX "phases_tournamentId_idx" ON "phases"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "phases_tournamentId_order_key" ON "phases"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "groups_phaseId_idx" ON "groups"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_phaseId_name_key" ON "groups"("phaseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "group_entries_groupId_entryId_key" ON "group_entries"("groupId", "entryId");

-- CreateIndex
CREATE INDEX "matches_status_scheduledAt_idx" ON "matches"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "matches_phaseId_round_idx" ON "matches"("phaseId", "round");

-- CreateIndex
CREATE INDEX "matches_groupId_idx" ON "matches"("groupId");

-- CreateIndex
CREATE INDEX "matches_entryAId_idx" ON "matches"("entryAId");

-- CreateIndex
CREATE INDEX "matches_entryBId_idx" ON "matches"("entryBId");

-- CreateIndex
CREATE INDEX "matches_winnerEntryId_idx" ON "matches"("winnerEntryId");

-- CreateIndex
CREATE INDEX "match_events_athleteId_idx" ON "match_events"("athleteId");

-- CreateIndex
CREATE INDEX "match_events_entryId_idx" ON "match_events"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_matchId_sequence_key" ON "match_events"("matchId", "sequence");

-- CreateIndex
CREATE INDEX "phase_standings_phaseId_points_scoreFor_idx" ON "phase_standings"("phaseId", "points" DESC, "scoreFor" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "phase_standings_phaseId_entryId_key" ON "phase_standings"("phaseId", "entryId");

-- CreateIndex
CREATE INDEX "audit_logs_editionId_createdAt_idx" ON "audit_logs"("editionId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_staffId_idx" ON "audit_logs"("staffId");

-- AddForeignKey
ALTER TABLE "competition_editions" ADD CONSTRAINT "competition_editions_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_disciplines" ADD CONSTRAINT "edition_disciplines_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_disciplines" ADD CONSTRAINT "edition_disciplines_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_rosters" ADD CONSTRAINT "edition_rosters_editionDisciplineId_fkey" FOREIGN KEY ("editionDisciplineId") REFERENCES "edition_disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_rosters" ADD CONSTRAINT "edition_rosters_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_rosters" ADD CONSTRAINT "edition_rosters_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_staff_roles" ADD CONSTRAINT "edition_staff_roles_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_staff_roles" ADD CONSTRAINT "edition_staff_roles_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edition_staff_roles" ADD CONSTRAINT "edition_staff_roles_editionDisciplineId_fkey" FOREIGN KEY ("editionDisciplineId") REFERENCES "edition_disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_editionDisciplineId_fkey" FOREIGN KEY ("editionDisciplineId") REFERENCES "edition_disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phases" ADD CONSTRAINT "phases_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_entries" ADD CONSTRAINT "group_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_entries" ADD CONSTRAINT "group_entries_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "tournament_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_entryAId_fkey" FOREIGN KEY ("entryAId") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_entryBId_fkey" FOREIGN KEY ("entryBId") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_standings" ADD CONSTRAINT "phase_standings_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_standings" ADD CONSTRAINT "phase_standings_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "tournament_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "competition_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
