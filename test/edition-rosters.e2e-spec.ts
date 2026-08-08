/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, EditionStaffRoleType, RosterStatus } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestTeam,
  createTestAthlete,
  createTestEditionRoster,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Edition Rosters Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;
  let disciplineManagerToken: string;
  let otherDisciplineManagerToken: string;

  // IDs
  let editionAdminId: string;
  let disciplineManagerId: string;
  let editionId: string;
  let otherEditionId: string;

  // Entities
  let futsalDisciplineId: string;
  let tennisDisciplineId: string; // individual
  let futsalEditionDisciplineId: string;
  let tennisEditionDisciplineId: string;

  let teamAId: string;
  let teamBId: string;
  let athleteAId: string;
  let athleteBId: string;

  let login: (email: string) => Promise<string>;
  const rawPassword = 'password123';

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

    // Setup users
    const passwordHash = await bcrypt.hash(rawPassword, 10);

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

    const editionAdmin = await createTestStaff(prisma, {
      email: 'edadmin@example.com',
      passwordHash,
      isSuperAdmin: false,
    });
    editionAdminId = editionAdmin.id;

    const otherEditionAdmin = await createTestStaff(prisma, {
      email: 'otheredadmin@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    const disciplineManager = await createTestStaff(prisma, {
      email: 'discmanager@example.com',
      passwordHash,
      isSuperAdmin: false,
    });
    disciplineManagerId = disciplineManager.id;

    const otherDisciplineManager = await createTestStaff(prisma, {
      email: 'otherdiscmanager@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    // Login helper to set tokens
    login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: rawPassword });
      return res.body.data.accessToken as string;
    };

    superAdminToken = await login('superadmin@example.com');
    regularStaffToken = await login('staff@example.com');
    editionAdminToken = await login('edadmin@example.com');
    disciplineManagerToken = await login('discmanager@example.com');
    otherDisciplineManagerToken = await login('otherdiscmanager@example.com');

    // Create Base Competition and Editions
    const competition = await createTestCompetition(prisma, {
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
    });

    const edition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2026,
      name: 'Jogos 2026',
    });
    editionId = edition.id;

    const otherEdition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2027,
      name: 'Jogos 2027',
    });
    otherEditionId = otherEdition.id;

    // Assign Roles
    await createTestEditionStaffRole(prisma, {
      editionId: editionId,
      staffId: editionAdminId,
      role: EditionStaffRoleType.EDITION_ADMIN,
    });

    await createTestEditionStaffRole(prisma, {
      editionId: otherEditionId,
      staffId: otherEditionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
    });

    // Create disciplines (Futsal - collective, Tennis - individual)
    const futsal = await createTestDiscipline(prisma, {
      name: 'Futsal',
      slug: 'futsal',
      isIndividual: false,
    });
    futsalDisciplineId = futsal.id;

    const tennis = await createTestDiscipline(prisma, {
      name: 'Tennis',
      slug: 'tennis',
      isIndividual: true,
    });
    tennisDisciplineId = tennis.id;

    // Associate disciplines to Edition
    const futsalEd = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: futsalDisciplineId,
    });
    futsalEditionDisciplineId = futsalEd.id;

    const tennisEd = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: tennisDisciplineId,
    });
    tennisEditionDisciplineId = tennisEd.id;

    // Assign Discipline Manager to Futsal in editionId
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: disciplineManagerId,
      editionDisciplineId: futsalEditionDisciplineId,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
    });

    // Assign other Discipline Manager to Tennis
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: otherDisciplineManager.id,
      editionDisciplineId: tennisEditionDisciplineId,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
    });

    // Create Teams
    const teamA = await createTestTeam(prisma, { name: 'CIn FC', slug: 'cin-fc' });
    teamAId = teamA.id;
    const teamB = await createTestTeam(prisma, { name: 'EE FC', slug: 'ee-fc' });
    teamBId = teamB.id;

    // Create Athletes
    const athleteA = await createTestAthlete(prisma, {
      name: 'João Silva',
      document: '11111111111',
    });
    athleteAId = athleteA.id;
    const athleteB = await createTestAthlete(prisma, {
      name: 'Maria Souza',
      document: '22222222222',
    });
    athleteBId = athleteB.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /editions/:editionId/rosters', () => {
    it('should list all rosters of the edition', async () => {
      await createTestEditionRoster(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        athleteId: athleteAId,
        teamId: teamAId,
        jerseyNumber: 10,
        status: RosterStatus.ACTIVE,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/rosters`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        editionId,
        editionName: 'Jogos 2026',
        disciplineId: futsalDisciplineId,
        disciplineName: 'Futsal',
        teamId: teamAId,
        teamName: 'CIn FC',
        jerseyNumber: 10,
        status: RosterStatus.ACTIVE,
        athlete: {
          id: athleteAId,
          name: 'João Silva',
        },
      });
    });

    it('should filter rosters by disciplineId and teamId', async () => {
      await createTestEditionRoster(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        athleteId: athleteAId,
        teamId: teamAId,
      });
      await createTestEditionRoster(prisma, {
        editionDisciplineId: tennisEditionDisciplineId,
        athleteId: athleteBId,
        teamId: null,
      });

      // Filter by Futsal
      const resFutsal = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/rosters?disciplineId=${futsalDisciplineId}`)
        .expect(HttpStatus.OK);
      expect(resFutsal.body.data).toHaveLength(1);
      expect(resFutsal.body.data[0].disciplineId).toBe(futsalDisciplineId);

      // Filter by teamA
      const resTeam = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/rosters?teamId=${teamAId}`)
        .expect(HttpStatus.OK);
      expect(resTeam.body.data).toHaveLength(1);
      expect(resTeam.body.data[0].teamId).toBe(teamAId);
    });

    it('should return 404 if edition does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/editions/nonexistent-id/rosters')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /editions/:editionId/rosters', () => {
    it('should allow EDITION_ADMIN to register an athlete in a collective discipline', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: teamAId,
          jerseyNumber: 7,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toMatchObject({
        editionId,
        disciplineId: futsalDisciplineId,
        teamId: teamAId,
        jerseyNumber: 7,
        status: RosterStatus.ACTIVE,
        athlete: {
          id: athleteAId,
          name: 'João Silva',
        },
      });
    });

    it('should allow authorized DISCIPLINE_MANAGER to register an athlete', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: teamAId,
        })
        .expect(HttpStatus.CREATED);
    });

    it('should deny unauthorized DISCIPLINE_MANAGER (different discipline)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`) // manager of tennis
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: teamAId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should deny regular staff from registering an athlete', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: teamAId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow teamId to be present for an individual discipline (Tennis)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disciplineId: tennisDisciplineId,
          athleteId: athleteAId,
          teamId: teamAId,
        })
        .expect(HttpStatus.CREATED);
    });

    it('should return 400 when teamId is missing for an individual discipline (Tennis)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disciplineId: tennisDisciplineId,
          athleteId: athleteAId,
          teamId: null,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 when teamId is missing for a collective discipline (Futsal)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: null,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 409 Conflict if registration is duplicated', async () => {
      await createTestEditionRoster(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        athleteId: athleteAId,
        teamId: teamAId,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: athleteAId,
          teamId: teamBId,
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return 404 if athlete does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/rosters`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          disciplineId: futsalDisciplineId,
          athleteId: 'nonexistent-athlete-id',
          teamId: teamAId,
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /editions/:editionId/rosters/:id', () => {
    let rosterId: string;

    beforeEach(async () => {
      const roster = await createTestEditionRoster(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        athleteId: athleteAId,
        teamId: teamAId,
        status: RosterStatus.ACTIVE,
      });
      rosterId = roster.id;
    });

    it('should allow EDITION_ADMIN to update roster status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ status: RosterStatus.INJURED })
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(RosterStatus.INJURED);
    });

    it('should allow authorized DISCIPLINE_MANAGER to update roster status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: RosterStatus.SUSPENDED })
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(RosterStatus.SUSPENDED);
    });

    it('should deny unauthorized DISCIPLINE_MANAGER (different discipline)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send({ status: RosterStatus.SUSPENDED })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 if roster does not exist', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/nonexistent-roster-id`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: RosterStatus.INJURED })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should allow authorized DISCIPLINE_MANAGER to update the teamId (transfer athlete)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ teamId: teamBId })
        .expect(HttpStatus.OK);

      expect(res.body.data.teamId).toBe(teamBId);
      expect(res.body.data.teamName).toBe('EE FC');
    });

    it('should return 404 when updating with a nonexistent teamId', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ teamId: 'nonexistent-team-id' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /editions/:editionId/rosters/:id', () => {
    let rosterId: string;

    beforeEach(async () => {
      const roster = await createTestEditionRoster(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        athleteId: athleteAId,
        teamId: teamAId,
      });
      rosterId = roster.id;
    });

    it('should allow EDITION_ADMIN to delete roster entry', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify deletion in DB
      const deleted = await prisma.editionRoster.findUnique({
        where: { id: rosterId },
      });
      expect(deleted).toBeNull();
    });

    it('should deny DISCIPLINE_MANAGER from deleting roster entry', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 if roster does not exist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/rosters/nonexistent-roster-id`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
