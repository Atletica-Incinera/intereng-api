import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, EditionStaffRoleType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents } from '../src/common/events';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestEditionStaffRole,
  createTestTournament,
  createTestPhase,
  createTestGroup,
  createTestTournamentEntry,
  createTestMatch,
} from './factories';

describe('Matches Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let eventEmitter: EventEmitter2;

  const rawPassword = 'Password123!';
  let regularStaffToken: string;
  let disciplineManagerToken: string;
  let otherDisciplineManagerToken: string;

  let editionId: string;
  let disciplineId: string;
  let editionDisciplineId: string;
  let tournamentId: string;
  let phaseId: string;
  let groupId: string;

  let entryAId: string;
  let entryBId: string;

  let login: (email: string) => Promise<string>;

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    eventEmitter = app.get<EventEmitter2>(EventEmitter2);

    const passwordHash = '$2b$10$eDiV7JbTu2Tt5P9TFztR8uj0NVbyt5RRVHf7qCpLi9ztzng8AoUsW';

    await createTestStaff(prisma, {
      email: 'superadmin@example.com',
      passwordHash,
      isSuperAdmin: true,
    });

    await createTestStaff(prisma, {
      email: 'staff@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    const disciplineManager = await createTestStaff(prisma, {
      email: 'discmanager@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    const otherDisciplineManager = await createTestStaff(prisma, {
      email: 'otherdiscmanager@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: rawPassword });
      return res.body.data.accessToken as string;
    };

    await login('superadmin@example.com');
    regularStaffToken = await login('staff@example.com');
    disciplineManagerToken = await login('discmanager@example.com');
    otherDisciplineManagerToken = await login('otherdiscmanager@example.com');

    // Create Hierarchy
    const competition = await createTestCompetition(prisma);
    const edition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2026,
    });
    editionId = edition.id;

    const discipline = await createTestDiscipline(prisma);
    disciplineId = discipline.id;

    const edDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId,
    });
    editionDisciplineId = edDisc.id;

    const tournament = await createTestTournament(prisma, {
      editionDisciplineId,
    });
    tournamentId = tournament.id;

    const phase = await createTestPhase(prisma, { tournamentId });
    phaseId = phase.id;

    const group = await createTestGroup(prisma, { phaseId });
    groupId = group.id;

    // Entries for tournament
    const entryA = await createTestTournamentEntry(prisma, { tournamentId });
    entryAId = entryA.id;
    const entryB = await createTestTournamentEntry(prisma, { tournamentId });
    entryBId = entryB.id;

    // Associate Roles
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: disciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId,
    });

    // Create another Edition / Discipline to verify isolation
    const otherEdition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2027,
    });
    const otherEdDisc = await createTestEditionDiscipline(prisma, {
      editionId: otherEdition.id,
      disciplineId,
    });
    await createTestEditionStaffRole(prisma, {
      editionId: otherEdition.id,
      staffId: otherDisciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: otherEdDisc.id,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /phases/:phaseId/matches', () => {
    it('should deny access to unauthorized staff members', async () => {
      const payload = {
        round: 1,
        entryAId,
        entryBId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send(payload)
        .expect(403);
    });

    it('should deny access to discipline managers of different disciplines/editions', async () => {
      const payload = {
        round: 1,
        entryAId,
        entryBId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send(payload)
        .expect(403);
    });

    it('should allow authorized DISCIPLINE_MANAGER to create a match', async () => {
      const payload = {
        groupId,
        round: 1,
        bracketSlot: 2,
        entryAId,
        entryBId,
        scheduledAt: '2026-10-13T14:00:00.000Z',
        venue: 'Ginásio CIn',
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.round).toBe(1);
      expect(res.body.data.bracketSlot).toBe(2);
      expect(res.body.data.venue).toBe('Ginásio CIn');
      expect(res.body.data.entryA.id).toBe(entryAId);
      expect(res.body.data.entryB.id).toBe(entryBId);
      expect(res.body.data.status).toBe('SCHEDULED');
    });

    it('should allow bye matches where entryBId is null', async () => {
      const payload = {
        round: 1,
        entryAId,
        entryBId: null,
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.entryA.id).toBe(entryAId);
      expect(res.body.data.entryB).toBeNull();
    });

    it('should return 400 bad request when entryAId and entryBId are identical', async () => {
      const payload = {
        round: 1,
        entryAId,
        entryBId: entryAId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(400);
    });

    it('should return 400 bad request when entryId does not belong to tournament', async () => {
      // Create a different tournament
      const otherTournament = await createTestTournament(prisma, { editionDisciplineId });
      const otherEntry = await createTestTournamentEntry(prisma, {
        tournamentId: otherTournament.id,
      });

      const payload = {
        round: 1,
        entryAId: otherEntry.id,
        entryBId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(400);
    });

    it('should return 400 bad request when groupId does not belong to phase', async () => {
      const otherPhase = await createTestPhase(prisma, { tournamentId });
      const otherGroup = await createTestGroup(prisma, { phaseId: otherPhase.id });

      const payload = {
        groupId: otherGroup.id,
        round: 1,
        entryAId,
        entryBId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/matches`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(400);
    });
  });

  describe('GET /phases/:phaseId/matches', () => {
    it('should retrieve all matches for a phase with public access', async () => {
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, round: 1, status: 'SCHEDULED' });
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, round: 2, status: 'LIVE' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/phases/${phaseId}/matches`)
        .expect(200);

      expect(res.body.data.length).toBe(2);
    });

    it('should filter matches by status', async () => {
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, status: 'SCHEDULED' });
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, status: 'LIVE' });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/phases/${phaseId}/matches?status=LIVE`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('LIVE');
    });

    it('should filter matches by round', async () => {
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, round: 1 });
      await createTestMatch(prisma, { phaseId, entryAId, entryBId, round: 2 });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/phases/${phaseId}/matches?round=2`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].round).toBe(2);
    });

    it('should return 404 when phase does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/phases/nonexistent-phase-id/matches')
        .expect(404);
    });
  });

  describe('GET /matches/:id', () => {
    it('should retrieve a single match by id with public access', async () => {
      const match = await createTestMatch(prisma, { phaseId, entryAId, entryBId });

      const res = await request(app.getHttpServer()).get(`/api/v1/matches/${match.id}`).expect(200);

      expect(res.body.data.id).toBe(match.id);
      expect(res.body.data.entryA.id).toBe(entryAId);
    });

    it('should return 404 when match does not exist', async () => {
      await request(app.getHttpServer()).get('/api/v1/matches/nonexistent-match-id').expect(404);
    });
  });

  describe('PATCH /matches/:id', () => {
    it('should allow authorized DISCIPLINE_MANAGER to update match details', async () => {
      const match = await createTestMatch(prisma, { phaseId, entryAId, entryBId });

      const payload = {
        round: 5,
        venue: 'Ginásio CTG',
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/matches/${match.id}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.data.round).toBe(5);
      expect(res.body.data.venue).toBe('Ginásio CTG');
    });

    it('should return 400 when updating entries to be identical', async () => {
      const match = await createTestMatch(prisma, { phaseId, entryAId, entryBId });

      const payload = {
        entryBId: entryAId,
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/matches/${match.id}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(400);
    });
  });

  describe('PATCH /matches/:id/status', () => {
    it('should allow authorized DISCIPLINE_MANAGER to update status', async () => {
      const match = await createTestMatch(prisma, {
        phaseId,
        entryAId,
        entryBId,
        status: 'SCHEDULED',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/matches/${match.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: 'LIVE' })
        .expect(200);

      expect(res.body.data.status).toBe('LIVE');
    });

    it('should set winnerEntryId and emit match.finished event when transitioning to FINISHED', async () => {
      const match = await createTestMatch(prisma, {
        phaseId,
        entryAId,
        entryBId,
        status: 'LIVE',
        scoreA: 3,
        scoreB: 1,
      });

      const spy = jest.fn();
      eventEmitter.on(DomainEvents.MATCH_FINISHED, spy);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/matches/${match.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: 'FINISHED' })
        .expect(200);

      expect(res.body.data.status).toBe('FINISHED');
      expect(res.body.data.winnerEntryId).toBe(entryAId);

      expect(spy).toHaveBeenCalledTimes(1);
      const eventPayload = spy.mock.calls[0][0];
      expect(eventPayload.matchId).toBe(match.id);
      expect(eventPayload.winnerEntryId).toBe(entryAId);
    });

    it('should set winnerEntryId to null on draw when transitioning to FINISHED', async () => {
      const match = await createTestMatch(prisma, {
        phaseId,
        entryAId,
        entryBId,
        status: 'LIVE',
        scoreA: 2,
        scoreB: 2,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/matches/${match.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: 'FINISHED' })
        .expect(200);

      expect(res.body.data.winnerEntryId).toBeNull();
    });
  });
});
