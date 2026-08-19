import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AuditContext, Auditable } from './index';
import { Audited } from './audited.decorator';
import { Injectable } from '@nestjs/common';
import { MatchStatus, TournamentFormat, PhaseType, Match } from '@prisma/client';

/**
 * Helper function to clean all tables in the database to prevent test cross-contamination
 * and adhere to DRY principles across test hooks.
 */
async function cleanDatabase(prisma: PrismaService) {
  await prisma.auditLog.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.phase.deleteMany({});
  await prisma.tournament.deleteMany({});
  await prisma.editionDiscipline.deleteMany({});
  await prisma.discipline.deleteMany({});
  await prisma.competitionEdition.deleteMany({});
  await prisma.competition.deleteMany({});
  await prisma.staff.deleteMany({});
}

@Injectable()
class DummyService implements Auditable {
  constructor(public readonly auditService: AuditService) {}

  @Audited('UPDATE_STATUS', 'Match')
  updateMatchStatusAudited(
    _before: unknown,
    _after: unknown,
    _ctx: AuditContext,
  ): Promise<{ success: boolean }> {
    return Promise.resolve({ success: true });
  }
}

describe('AuditService', () => {
  let prisma: PrismaService;
  let auditService: AuditService;
  let dummyService: DummyService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/competitions?schema=public';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, AuditService, DummyService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    dummyService = module.get<DummyService>(DummyService);

    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  describe('Integration tests with PostgreSQL transactions', () => {
    let matchId: string;
    let editionId: string;
    let staffId: string;

    beforeEach(async () => {
      // Clean up previous test runs
      await cleanDatabase(prisma);

      // Setup dependencies
      const staff = await prisma.staff.create({
        data: {
          name: 'Audit Test Staff',
          email: 'audit-test-staff@example.com',
          passwordHash: 'dummyhash',
        },
      });
      staffId = staff.id;

      const competition = await prisma.competition.create({
        data: {
          name: 'Audit Test Competition',
          slug: 'audit-test-competition',
        },
      });

      const edition = await prisma.competitionEdition.create({
        data: {
          competitionId: competition.id,
          year: 2026,
          name: 'Audit Test 2026',
          startDate: new Date('2026-10-12T00:00:00Z'),
          endDate: new Date('2026-10-19T00:00:00Z'),
        },
      });
      editionId = edition.id;

      const discipline = await prisma.discipline.create({
        data: {
          name: 'Audit Futsal',
          slug: 'audit-futsal',
        },
      });

      const editionDiscipline = await prisma.editionDiscipline.create({
        data: {
          editionId: edition.id,
          disciplineId: discipline.id,
        },
      });

      const tournament = await prisma.tournament.create({
        data: {
          editionDisciplineId: editionDiscipline.id,
          name: 'Audit Torneio',
          format: TournamentFormat.SINGLE_ELIMINATION,
        },
      });

      const phase = await prisma.phase.create({
        data: {
          tournamentId: tournament.id,
          clientId: 'audit-phase-1',
          order: 1,
          name: 'Audit Phase 1',
          type: PhaseType.KNOCKOUT,
        },
      });

      const match = await prisma.match.create({
        data: {
          phaseId: phase.id,
          status: MatchStatus.SCHEDULED,
        },
      });
      matchId = match.id;
    });

    it('should successfully record an audit log when no transaction is provided', async () => {
      const before = { status: MatchStatus.SCHEDULED };
      const after = { status: MatchStatus.LIVE };

      const log = await auditService.record({
        staffId,
        editionId,
        action: 'UPDATE_STATUS',
        entityType: 'Match',
        entityId: matchId,
        before,
        after,
      });

      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
      expect(log.action).toBe('UPDATE_STATUS');
      expect(log.entityType).toBe('Match');
      expect(log.entityId).toBe(matchId);
      expect(log.beforeData).toEqual(before);
      expect(log.afterData).toEqual(after);

      // Verify DB persists the log
      const dbLog = await prisma.auditLog.findUnique({ where: { id: log.id } });
      expect(dbLog).toBeDefined();
    });

    it('should record audit log within a transaction successfully', async () => {
      const before = await prisma.match.findUnique({ where: { id: matchId } });
      let after: Match | null = null;

      await prisma.$transaction(async (tx) => {
        after = await tx.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.FINISHED },
        });

        await auditService.record(
          {
            staffId,
            editionId,
            action: 'UPDATE_STATUS',
            entityType: 'Match',
            entityId: matchId,
            before: before ?? undefined,
            after: after ?? undefined,
          },
          tx,
        );
      });

      // Verify the Match status changed
      const updatedMatch = await prisma.match.findUnique({
        where: { id: matchId },
      });
      expect(updatedMatch?.status).toBe(MatchStatus.FINISHED);

      // Verify the Audit Log is created
      const logs = await prisma.auditLog.findMany({
        where: { entityId: matchId },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('UPDATE_STATUS');
      expect(logs[0].beforeData).toEqual(JSON.parse(JSON.stringify(before)));
      expect(logs[0].afterData).toEqual(JSON.parse(JSON.stringify(after)));
    });

    it('should rollback both match update and audit log when a transaction fails', async () => {
      const before = await prisma.match.findUnique({ where: { id: matchId } });
      let txFailed = false;

      try {
        await prisma.$transaction(async (tx) => {
          const after = await tx.match.update({
            where: { id: matchId },
            data: { status: MatchStatus.FINISHED },
          });

          await auditService.record(
            {
              staffId,
              editionId,
              action: 'UPDATE_STATUS',
              entityType: 'Match',
              entityId: matchId,
              before: before ?? undefined,
              after: after ?? undefined,
            },
            tx,
          );

          // Force failure
          throw new Error('Forced transaction failure');
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Forced transaction failure') {
          txFailed = true;
        }
      }

      expect(txFailed).toBe(true);

      // Verify Match status is STILL SCHEDULED (rolled back)
      const rolledBackMatch = await prisma.match.findUnique({
        where: { id: matchId },
      });
      expect(rolledBackMatch?.status).toBe(MatchStatus.SCHEDULED);

      // Verify NO Audit Logs exist for this match
      const logs = await prisma.auditLog.findMany({
        where: { entityId: matchId },
      });
      expect(logs).toHaveLength(0);
    });

    it('should successfully record log using @Audited decorator', async () => {
      const before = { status: MatchStatus.SCHEDULED };
      const after = { status: MatchStatus.FINISHED };
      const ctx: AuditContext = {
        staffId,
        editionId,
      };

      const res = await dummyService.updateMatchStatusAudited(before, after, ctx);
      expect(res.success).toBe(true);

      // Verify the Audit Log is created
      const allLogs = await prisma.auditLog.findMany({});
      expect(allLogs).toHaveLength(1);
      expect(allLogs[0].action).toBe('UPDATE_STATUS');
      expect(allLogs[0].entityType).toBe('Match');
      expect(allLogs[0].staffId).toBe(staffId);
      expect(allLogs[0].editionId).toBe(editionId);
    });
  });
});
