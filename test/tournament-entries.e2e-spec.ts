import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, EditionStaffRoleType, TournamentFormat } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestTeam,
  createTestAthlete,
  createTestTournament,
  createTestTournamentEntry,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Tournament Entries Module (e2e)', () => {
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
  let chessDisciplineId: string; // individual
  let futsalEditionDisciplineId: string;
  let chessEditionDisciplineId: string;

  let futsalTournamentId: string;
  let chessTournamentId: string;

  let teamAId: string;
  let teamBId: string;
  let athleteAId: string;

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
    const passwordHash = '$2b$10$EXunA2kI86D5KaloSvNjQuIQOWNYzqKvdjLLASS76Dokg26rmjuE6';

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

    // Login helper
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

    // Create disciplines
    const futsal = await createTestDiscipline(prisma, {
      name: 'Futsal',
      slug: 'futsal',
      isIndividual: false,
    });
    futsalDisciplineId = futsal.id;

    const chess = await createTestDiscipline(prisma, {
      name: 'Xadrez',
      slug: 'xadrez',
      isIndividual: true,
    });
    chessDisciplineId = chess.id;

    // Associate disciplines to Edition
    const futsalEdDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: futsalDisciplineId,
    });
    futsalEditionDisciplineId = futsalEdDisc.id;

    const chessEdDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: chessDisciplineId,
    });
    chessEditionDisciplineId = chessEdDisc.id;

    // Assign DM roles
    await createTestEditionStaffRole(prisma, {
      editionId: editionId,
      staffId: disciplineManagerId,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: futsalEditionDisciplineId,
    });

    await createTestEditionStaffRole(prisma, {
      editionId: editionId,
      staffId: otherDisciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: chessEditionDisciplineId,
    });

    // Create Tournaments
    const futsalTour = await createTestTournament(prisma, {
      editionDisciplineId: futsalEditionDisciplineId,
      name: 'Futsal Masculino',
      format: TournamentFormat.GROUP_KNOCKOUT,
    });
    futsalTournamentId = futsalTour.id;

    const chessTour = await createTestTournament(prisma, {
      editionDisciplineId: chessEditionDisciplineId,
      name: 'Xadrez Open',
      format: TournamentFormat.SINGLE_ELIMINATION,
    });
    chessTournamentId = chessTour.id;

    // Create Catalog Entities
    const teamA = await createTestTeam(prisma, { name: 'CIn FC', slug: 'cin-fc' });
    teamAId = teamA.id;
    const teamB = await createTestTeam(prisma, { name: 'EE United', slug: 'ee-united' });
    teamBId = teamB.id;

    const athleteA = await createTestAthlete(prisma, { name: 'João Silva' });
    athleteAId = athleteA.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/tournaments/:tournamentId/entries', () => {
    it('should create a collective tournament entry successfully by SuperAdmin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          teamId: teamAId,
          seed: 1,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.tournamentId).toBe(futsalTournamentId);
      expect(res.body.data.teamId).toBe(teamAId);
      expect(res.body.data.teamName).toBe('CIn FC');
      expect(res.body.data.athleteId).toBeNull();
      expect(res.body.data.seed).toBe(1);

      // Verify audit log
      const responseBody = res.body as { data: { id: string } };
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'TournamentEntry', entityId: responseBody.data.id },
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('CREATE');
    });

    it('should create an individual tournament entry successfully by EDITION_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${chessTournamentId}/entries`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          athleteId: athleteAId,
          seed: null,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.tournamentId).toBe(chessTournamentId);
      expect(res.body.data.athleteId).toBe(athleteAId);
      expect(res.body.data.athleteName).toBe('João Silva');
      expect(res.body.data.teamId).toBeNull();
      expect(res.body.data.seed).toBeNull();
    });

    it('should create a tournament entry successfully by matching DISCIPLINE_MANAGER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          teamId: teamAId,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.teamId).toBe(teamAId);
    });

    it('should fail with 403 when wrong DISCIPLINE_MANAGER requests enrollment', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send({
          teamId: teamAId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 403 when regular staff requests enrollment', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({
          teamId: teamAId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 400 when both teamId and athleteId are provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          teamId: teamAId,
          athleteId: athleteAId,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 400 when neither teamId nor athleteId is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          seed: 2,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 400 when collective discipline is registered with athleteId', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          athleteId: athleteAId,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 400 when individual discipline is registered with teamId', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${chessTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          teamId: teamAId,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 404 when teamId does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          teamId: 'invalid-team-id',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with 404 when athleteId does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${chessTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          athleteId: 'invalid-athlete-id',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with 409 when team is already registered', async () => {
      await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
        teamId: teamAId,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          teamId: teamAId,
        })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('GET /api/v1/tournaments/:tournamentId/entries', () => {
    it('should retrieve all entries for a tournament successfully (public)', async () => {
      await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
        teamId: teamAId,
        seed: 1,
      });

      await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
        teamId: teamBId,
        seed: 2,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${futsalTournamentId}/entries`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].teamName).toBe('CIn FC');
      expect(res.body.data[1].teamName).toBe('EE United');
    });

    it('should fail with 404 when tournament does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tournaments/invalid-tournament-id/entries')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/tournaments/:tournamentId/entries/:id', () => {
    let entryId: string;

    beforeEach(async () => {
      const entry = await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
        teamId: teamAId,
      });
      entryId = entry.id;
    });

    it('should delete tournament entry successfully by SuperAdmin', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify deletion
      const deleted = await prisma.tournamentEntry.findUnique({
        where: { id: entryId },
      });
      expect(deleted).toBeNull();

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'TournamentEntry', entityId: entryId, action: 'DELETE' },
      });
      expect(log).toBeDefined();
    });

    it('should delete tournament entry successfully by EDITION_ADMIN', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should delete tournament entry successfully by matching DISCIPLINE_MANAGER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should fail with 403 when requested by wrong DISCIPLINE_MANAGER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 403 when requested by regular staff', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 404 when entry belongs to another tournament', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${chessTournamentId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with 404 when entry does not exist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${futsalTournamentId}/entries/non-existent-id`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
