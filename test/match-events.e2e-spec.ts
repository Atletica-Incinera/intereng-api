import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, EditionStaffRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
  createTestTournamentEntry,
  createTestMatch,
  createTestTeam,
} from './factories';

describe('Match Events Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let eventEmitter: EventEmitter2;

  const rawPassword = 'Password123!';
  let disciplineManagerToken: string;
  let otherDisciplineManagerToken: string;
  let regularStaffToken: string;

  let editionId: string;
  let disciplineId: string;
  let editionDisciplineId: string;
  let tournamentId: string;
  let phaseId: string;
  let matchId: string;

  let entryAId: string;
  let entryBId: string;

  let login: (email: string) => Promise<string>;

  beforeAll(async () => {
    jest.setTimeout(30000);
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

    // Create staff
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
      email: 'dm@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    const otherDisciplineManager = await createTestStaff(prisma, {
      email: 'otherdm@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: rawPassword });
      return res.body.data.accessToken as string;
    };

    regularStaffToken = await login('staff@example.com');
    disciplineManagerToken = await login('dm@example.com');
    otherDisciplineManagerToken = await login('otherdm@example.com');

    // Hierarchy
    const competition = await createTestCompetition(prisma);
    const edition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2026,
    });
    editionId = edition.id;

    // Use futsal as discipline
    const discipline = await createTestDiscipline(prisma, { name: 'Futsal', slug: 'futsal' });
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

    // Team and athlete entries
    const teamA = await createTestTeam(prisma);
    const teamB = await createTestTeam(prisma);

    const entryA = await createTestTournamentEntry(prisma, { tournamentId, teamId: teamA.id });
    entryAId = entryA.id;
    const entryB = await createTestTournamentEntry(prisma, { tournamentId, teamId: teamB.id });
    entryBId = entryB.id;

    const match = await createTestMatch(prisma, {
      phaseId,
      entryAId,
      entryBId,
      scoreA: 0,
      scoreB: 0,
      lastEventSequence: 0,
      status: 'LIVE',
    });
    matchId = match.id;

    // Associate discipline manager role
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: disciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId,
    });

    const otherEdDisc = await createTestEditionDiscipline(prisma);
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: otherDisciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: otherEdDisc.id,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /matches/:matchId/events', () => {
    it('should retrieve all events for a match with public access', async () => {
      await prisma.matchEvent.createMany({
        data: [
          { matchId, type: 'GOAL', sequence: 1, occurredAt: new Date() },
          { matchId, type: 'YELLOW_CARD', sequence: 2, occurredAt: new Date() },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/events`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].sequence).toBe(1);
      expect(res.body.data[1].sequence).toBe(2);
    });

    it('should return 404 when match does not exist', async () => {
      await request(app.getHttpServer()).get('/api/v1/matches/nonexistent-id/events').expect(404);
    });
  });

  describe('POST /matches/:matchId/events', () => {
    it('should deny access to unauthorized staff', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/matches/${matchId}/events`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({
          entryId: entryAId,
          type: 'GOAL',
          metadata: { minute: 15 },
        })
        .expect(403);
    });

    it('should deny access to managers of different disciplines', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/matches/${matchId}/events`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send({
          entryId: entryAId,
          type: 'GOAL',
          metadata: { minute: 15 },
        })
        .expect(403);
    });

    it('should allow authorized discipline manager to create event and update match score', async () => {
      const spy = jest.fn();
      eventEmitter.on(DomainEvents.MATCH_EVENT_CREATED, spy);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/matches/${matchId}/events`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          entryId: entryAId,
          type: 'GOAL',
          metadata: { minute: 15 },
        })
        .expect(201);

      expect(res.body.data.type).toBe('GOAL');
      expect(res.body.data.sequence).toBe(1);

      const match = await prisma.match.findUnique({ where: { id: matchId } });
      expect(match?.scoreA).toBe(1);
      expect(match?.scoreB).toBe(0);
      expect(match?.lastEventSequence).toBe(1);

      // Check domain event was emitted
      expect(spy).toHaveBeenCalledTimes(1);
      const emittedPayload = spy.mock.calls[0][0];
      expect(emittedPayload.matchId).toBe(matchId);
      expect(emittedPayload.type).toBe('GOAL');
      expect(emittedPayload.scoreA).toBe(1);
      expect(emittedPayload.scoreB).toBe(0);
    });

    it('should validate metadata using dynamic validator', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/matches/${matchId}/events`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          entryId: entryAId,
          type: 'GOAL',
          metadata: { minute: -5 }, // Invalid minute
        })
        .expect(400);
    });

    it('should prevent creating events with entryId that does not belong to the match', async () => {
      const otherEntry = await createTestTournamentEntry(prisma, { tournamentId });

      await request(app.getHttpServer())
        .post(`/api/v1/matches/${matchId}/events`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          entryId: otherEntry.id,
          type: 'GOAL',
          metadata: { minute: 10 },
        })
        .expect(400);
    });

    it('should handle concurrent requests using SELECT FOR UPDATE lock', async () => {
      // Act: Disparar 2 requisições em paralelo
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/matches/${matchId}/events`)
          .set('Authorization', `Bearer ${disciplineManagerToken}`)
          .send({
            entryId: entryAId,
            type: 'GOAL',
            metadata: { minute: 10 },
          }),
        request(app.getHttpServer())
          .post(`/api/v1/matches/${matchId}/events`)
          .set('Authorization', `Bearer ${disciplineManagerToken}`)
          .send({
            entryId: entryBId,
            type: 'GOAL',
            metadata: { minute: 20 },
          }),
      ]);

      expect([res1.status, res2.status]).toContain(201);
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Assert sequences are 1 and 2 ordered correctly
      const events = await prisma.matchEvent.findMany({
        where: { matchId },
        orderBy: { sequence: 'asc' },
      });
      expect(events).toHaveLength(2);
      expect(events[0].sequence).toBe(1);
      expect(events[1].sequence).toBe(2);

      const match = await prisma.match.findUnique({ where: { id: matchId } });
      expect(match?.lastEventSequence).toBe(2);
      expect(match?.scoreA).toBe(1);
      expect(match?.scoreB).toBe(1);
    });
  });

  describe('DELETE /matches/:matchId/events/:id', () => {
    it('should allow deletion of an event and correctly recalculate and revert match score', async () => {
      // Setup some events
      const event1 = await prisma.matchEvent.create({
        data: { matchId, entryId: entryAId, type: 'GOAL', sequence: 1, metadata: { minute: 5 } },
      });
      await prisma.matchEvent.create({
        data: { matchId, entryId: entryBId, type: 'GOAL', sequence: 2, metadata: { minute: 10 } },
      });
      const event3 = await prisma.matchEvent.create({
        data: { matchId, entryId: entryAId, type: 'GOAL', sequence: 3, metadata: { minute: 15 } },
      });

      // Update match initially
      await prisma.match.update({
        where: { id: matchId },
        data: { scoreA: 2, scoreB: 1, lastEventSequence: 3 },
      });

      // Delete event3 (A's second goal)
      await request(app.getHttpServer())
        .delete(`/api/v1/matches/${matchId}/events/${event3.id}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(204);

      // Verify match state
      const match = await prisma.match.findUnique({ where: { id: matchId } });
      expect(match?.scoreA).toBe(1); // 2 - 1 = 1
      expect(match?.scoreB).toBe(1);
      expect(match?.lastEventSequence).toBe(2); // Sequence goes down to max remaining (2)

      // Delete event1 (A's first goal)
      await request(app.getHttpServer())
        .delete(`/api/v1/matches/${matchId}/events/${event1.id}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(204);

      const match2 = await prisma.match.findUnique({ where: { id: matchId } });
      expect(match2?.scoreA).toBe(0);
      expect(match2?.scoreB).toBe(1);
      expect(match2?.lastEventSequence).toBe(2); // Sequence is still max remaining (2)
    });

    it('should return 404 when deleting nonexistent event', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/matches/${matchId}/events/nonexistent-id`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(404);
    });
  });
});
