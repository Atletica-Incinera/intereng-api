import { PrismaClient } from '@prisma/client';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import {
  createTestCompetition,
  createTestCompetitionEdition,
  createTestDiscipline,
  createTestTeam,
  createTestAthlete,
  createTestStaff,
  createTestEditionDiscipline,
  createTestEditionRoster,
  createTestEditionStaffRole,
  createTestTournament,
  createTestTournamentEntry,
  createTestPhase,
  createTestGroup,
  createTestGroupEntry,
  createTestMatch,
  createTestMatchEvent,
  createTestPhaseStanding,
  createTestAuditLog,
} from './factories';

describe('Test Factories & resetDb helper', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    setupTestEnv();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('should successfully clean the database using resetDb()', async () => {
    // Populate some minimal data
    await createTestCompetition(prisma);

    // Count records
    const beforeCount = await prisma.competition.count();
    expect(beforeCount).toBe(1);

    // Reset
    await resetDb(prisma);

    const afterCount = await prisma.competition.count();
    expect(afterCount).toBe(0);
  });

  it('should create a valid Match with full dependency chain and persist it', async () => {
    const match = await createTestMatch(prisma);

    expect(match).toBeDefined();
    expect(match.id).toBeDefined();
    expect(match.phaseId).toBeDefined();

    // Verify it exists in the database
    const dbMatch = await prisma.match.findUnique({
      where: { id: match.id },
      include: {
        phase: {
          include: {
            tournament: {
              include: {
                editionDiscipline: {
                  include: {
                    edition: true,
                    discipline: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(dbMatch).not.toBeNull();
    expect(dbMatch?.phase).toBeDefined();
    expect(dbMatch?.phase.tournament).toBeDefined();
    expect(dbMatch?.phase.tournament.editionDiscipline).toBeDefined();
    expect(dbMatch?.phase.tournament.editionDiscipline.edition).toBeDefined();
    expect(dbMatch?.phase.tournament.editionDiscipline.discipline).toBeDefined();
  });

  it('should allow running createTestMatch twice without colliding on unique constraints', async () => {
    const match1 = await createTestMatch(prisma);
    const match2 = await createTestMatch(prisma);

    expect(match1.id).not.toBe(match2.id);

    const count = await prisma.match.count();
    expect(count).toBe(2);
  });

  it('should support all factories without throwing errors', async () => {
    const competition = await createTestCompetition(prisma);
    const edition = await createTestCompetitionEdition(prisma, { competitionId: competition.id });
    const discipline = await createTestDiscipline(prisma);
    const team = await createTestTeam(prisma);
    const athlete = await createTestAthlete(prisma);
    const staff = await createTestStaff(prisma);

    const editionDiscipline = await createTestEditionDiscipline(prisma, {
      editionId: edition.id,
      disciplineId: discipline.id,
    });

    const roster = await createTestEditionRoster(prisma, {
      editionDisciplineId: editionDiscipline.id,
      athleteId: athlete.id,
      teamId: team.id,
    });

    const staffRole = await createTestEditionStaffRole(prisma, {
      editionId: edition.id,
      staffId: staff.id,
      editionDisciplineId: editionDiscipline.id,
    });

    const tournament = await createTestTournament(prisma, {
      editionDisciplineId: editionDiscipline.id,
    });

    const entry = await createTestTournamentEntry(prisma, {
      tournamentId: tournament.id,
      teamId: team.id,
    });

    const phase = await createTestPhase(prisma, {
      tournamentId: tournament.id,
    });

    const group = await createTestGroup(prisma, {
      phaseId: phase.id,
    });

    const groupEntry = await createTestGroupEntry(prisma, {
      groupId: group.id,
      entryId: entry.id,
    });

    const match = await createTestMatch(prisma, {
      phaseId: phase.id,
      groupId: group.id,
      entryAId: entry.id,
    });

    const matchEvent = await createTestMatchEvent(prisma, {
      matchId: match.id,
      entryId: entry.id,
      athleteId: athlete.id,
    });

    const standing = await createTestPhaseStanding(prisma, {
      phaseId: phase.id,
      entryId: entry.id,
    });

    const auditLog = await createTestAuditLog(prisma, {
      editionId: edition.id,
      staffId: staff.id,
    });

    expect(competition).toBeDefined();
    expect(edition).toBeDefined();
    expect(discipline).toBeDefined();
    expect(team).toBeDefined();
    expect(athlete).toBeDefined();
    expect(staff).toBeDefined();
    expect(editionDiscipline).toBeDefined();
    expect(roster).toBeDefined();
    expect(staffRole).toBeDefined();
    expect(tournament).toBeDefined();
    expect(entry).toBeDefined();
    expect(phase).toBeDefined();
    expect(group).toBeDefined();
    expect(groupEntry).toBeDefined();
    expect(match).toBeDefined();
    expect(matchEvent).toBeDefined();
    expect(standing).toBeDefined();
    expect(auditLog).toBeDefined();
  });
});
