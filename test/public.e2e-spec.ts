import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, MatchStatus, PhaseType } from '@prisma/client';
import {
  createTestCompetition,
  createTestCompetitionEdition,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestTournament,
  createTestPhase,
  createTestMatch,
  createTestGroup,
  createTestGroupEntry,
  createTestPhaseStanding,
} from './factories';

describe('Public Spectator Endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let editionId: string;
  let tournamentId: string;
  let phaseId: string;
  let groupId: string;
  let matchId: string;

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

    // Setup base entities
    const competition = await createTestCompetition(prisma);
    const edition = await createTestCompetitionEdition(prisma, { competitionId: competition.id });
    editionId = edition.id;

    const discipline = await createTestDiscipline(prisma);
    const edDisc = await createTestEditionDiscipline(prisma, {
      editionId: edition.id,
      disciplineId: discipline.id,
    });

    const tournament = await createTestTournament(prisma, {
      editionDisciplineId: edDisc.id,
    });
    tournamentId = tournament.id;

    const phase = await createTestPhase(prisma, {
      tournamentId: tournament.id,
      type: PhaseType.GROUP,
    });
    phaseId = phase.id;

    const group = await createTestGroup(prisma, { phaseId: phase.id });
    groupId = group.id;

    // Criamos inscrições para o grupo
    const groupEntryA = await createTestGroupEntry(prisma, { groupId: group.id });
    const groupEntryB = await createTestGroupEntry(prisma, { groupId: group.id });

    // Criamos uma partida ao vivo
    const match = await createTestMatch(prisma, {
      phaseId: phase.id,
      groupId: group.id,
      entryAId: groupEntryA.entryId,
      entryBId: groupEntryB.entryId,
      status: MatchStatus.LIVE,
      scheduledAt: new Date('2026-10-13T15:00:00Z'),
      venue: 'Arena Central',
    });
    matchId = match.id;

    // Criamos classificação mockada
    await createTestPhaseStanding(prisma, {
      phaseId: phase.id,
      entryId: groupEntryA.entryId,
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      scoreFor: 2,
      scoreAgainst: 1,
      points: 3,
      rank: 1,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/editions/:editionId/live', () => {
    it('should return live matches without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/live`)
        .expect(HttpStatus.OK);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const liveMatch = response.body.data[0];
      expect(liveMatch.matchId).toBe(matchId);
      expect(liveMatch.scoreA).toBe(0);
      expect(liveMatch.scoreB).toBe(0);
      expect(liveMatch.venue).toBe('Arena Central');
      expect(liveMatch.tournamentName).toBeDefined();
      expect(liveMatch.disciplineName).toBeDefined();
    });

    it('should return 404 for nonexistent edition', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/editions/nonexistent/live')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/editions/:editionId/schedule', () => {
    it('should return schedule for a specific date', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/schedule`)
        .query({ date: '2026-10-13' })
        .expect(HttpStatus.OK);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const matchSchedule = response.body.data[0];
      expect(matchSchedule.matchId).toBe(matchId);
      expect(matchSchedule.status).toBe(MatchStatus.LIVE);
      expect(matchSchedule.scheduledAt).toBeDefined();
    });

    it('should return 400 Bad Request for missing/invalid date query parameter', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/schedule`)
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/schedule`)
        .query({ date: 'invalid-date' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/tournaments/:id/bracket', () => {
    it('should return complete bracket structure', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}/bracket`)
        .expect(HttpStatus.OK);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.format).toBeDefined();
      expect(response.body.data.phases).toBeDefined();
      expect(Array.isArray(response.body.data.phases)).toBe(true);

      const phaseBracket = response.body.data.phases[0];
      expect(phaseBracket.phaseId).toBe(phaseId);
      expect(phaseBracket.type).toBe('GROUP');
      expect(phaseBracket.groups).toBeDefined();
      expect(phaseBracket.groups[0].name).toBeDefined();
      expect(phaseBracket.groups[0].standings).toBeDefined();
      expect(phaseBracket.groups[0].standings.length).toBeGreaterThan(0);
    });

    it('should return 404 for nonexistent tournament', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tournaments/nonexistent/bracket')
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
