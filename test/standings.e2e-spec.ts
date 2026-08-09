import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  createTestPhase,
  createTestGroup,
  createTestGroupEntry,
  createTestMatch,
} from './factories';
import { MatchStatus } from '@prisma/client';
import { StandingsService } from '../src/standings/standings.service';

describe('Standings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    setupTestEnv();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1/phases/:phaseId/standings (GET) - retrieve standings successfully', async () => {
    // Create a phase of type GROUP
    const phase = await createTestPhase(prisma, {
      type: 'GROUP',
      config: {
        advanceCount: 2,
        tiebreakers: ['points', 'goalDiff'],
      },
    });

    const group = await createTestGroup(prisma, {
      phaseId: phase.id,
      name: 'Grupo E2E',
    });

    // Create group entries (teams)
    const groupEntryA = await createTestGroupEntry(prisma, { groupId: group.id });
    const groupEntryB = await createTestGroupEntry(prisma, { groupId: group.id });

    // Create a finished match where team A wins 2-0 against team B
    await createTestMatch(prisma, {
      phaseId: phase.id,
      groupId: group.id,
      entryAId: groupEntryA.entryId,
      entryBId: groupEntryB.entryId,
      scoreA: 2,
      scoreB: 0,
      winnerEntryId: groupEntryA.entryId,
      status: MatchStatus.FINISHED,
    });

    // Recompute standings manually or verify it was recalculated by matches update
    // In our service, the listener handles it when updateMatchStatus is called,
    const service = app.get(StandingsService);
    await service.recomputeStandings(phase.id);

    // Call public standings endpoint
    const response = await request(app.getHttpServer())
      .get(`/api/v1/phases/${phase.id}/standings`)
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.data).toHaveLength(2);

    const standings = response.body.data;

    // Team A should be Rank 1
    expect(standings[0].entryId).toBe(groupEntryA.entryId);
    expect(standings[0].played).toBe(1);
    expect(standings[0].won).toBe(1);
    expect(standings[0].lost).toBe(0);
    expect(standings[0].points).toBe(3);
    expect(standings[0].scoreFor).toBe(2);
    expect(standings[0].scoreAgainst).toBe(0);
    expect(standings[0].rank).toBe(1);

    // Team B should be Rank 2
    expect(standings[1].entryId).toBe(groupEntryB.entryId);
    expect(standings[1].played).toBe(1);
    expect(standings[1].won).toBe(0);
    expect(standings[1].lost).toBe(1);
    expect(standings[1].points).toBe(0);
    expect(standings[1].scoreFor).toBe(0);
    expect(standings[1].scoreAgainst).toBe(2);
    expect(standings[1].rank).toBe(2);
  });

  it('/api/v1/phases/:phaseId/standings (GET) - returns 404 for invalid phase', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/phases/invalid-phase-id-123/standings')
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error.message).toBe('Fase com ID "invalid-phase-id-123" não encontrada.');
      });
  });
});
