import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import {
  PrismaClient,
  EditionStaffRoleType,
  TournamentStatus,
  TournamentFormat,
} from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestTournament,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Tournaments Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;
  let disciplineManagerToken: string;
  let otherDisciplineManagerToken: string;

  // IDs
  let editionId: string;
  let futsalDisciplineId: string;
  let tennisDisciplineId: string;
  let futsalEditionDisciplineId: string;
  let tennisEditionDisciplineId: string;

  let login: (email: string) => Promise<string>;
  const rawPassword = 'password123';

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

    // Setup users
    const passwordHash = '$2b$10$EXunA2kI86D5KaloSvNjQuIQOWNYzqKvdjLLASS76Dokg26rmjuE6';

    // Super Admin
    await createTestStaff(prisma, {
      email: 'superadmin@example.com',
      passwordHash,
      isSuperAdmin: true,
    });

    // Regular Staff
    await createTestStaff(prisma, {
      email: 'staff@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    // Edition Admin
    const editionAdmin = await createTestStaff(prisma, {
      email: 'edadmin@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    // Discipline Manager (Futsal)
    const disciplineManager = await createTestStaff(prisma, {
      email: 'discmanager@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    // Other Discipline Manager (Tennis)
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

    // Create Disciplines
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

    // Associate disciplines with edition
    const futsalEdDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: futsalDisciplineId,
    });
    futsalEditionDisciplineId = futsalEdDisc.id;

    const tennisEdDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId: tennisDisciplineId,
    });
    tennisEditionDisciplineId = tennisEdDisc.id;

    // Assign roles
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: editionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
      editionDisciplineId: null,
    });

    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: disciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: futsalEditionDisciplineId,
    });

    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: otherDisciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: tennisEditionDisciplineId,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/editions/:editionId/tournaments', () => {
    const validPayload = {
      disciplineId: 'FUTSAL_PLACEHOLDER',
      name: 'Futsal Masculino',
      format: TournamentFormat.GROUP_KNOCKOUT,
    };

    beforeEach(() => {
      validPayload.disciplineId = futsalDisciplineId;
    });

    it('should create a tournament successfully when requested by SuperAdmin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe(validPayload.name);
      expect(res.body.data.format).toBe(validPayload.format);
      expect(res.body.data.status).toBe(TournamentStatus.DRAFT);
      expect(res.body.data.editionId).toBe(editionId);
      expect(res.body.data.disciplineId).toBe(futsalDisciplineId);

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Tournament', entityId: res.body.data.id },
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('CREATE');
    });

    it('should create a tournament successfully when requested by EDITION_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(validPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.name).toBe(validPayload.name);
    });

    it('should create a tournament successfully when requested by the correct DISCIPLINE_MANAGER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(validPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.name).toBe(validPayload.name);
    });

    it('should fail with 403 when requested by other DISCIPLINE_MANAGER', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send(validPayload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 403 when requested by regular staff', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send(validPayload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 404 when discipline is not associated with the edition', async () => {
      const otherDiscipline = await createTestDiscipline(prisma, { name: 'Chess', slug: 'chess' });
      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ...validPayload,
          disciplineId: otherDiscipline.id,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with 409 when tournament name already exists for the discipline in this edition', async () => {
      await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: validPayload.name,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/tournaments`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validPayload)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('GET /api/v1/editions/:editionId/tournaments', () => {
    beforeEach(async () => {
      await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Torneio A',
        status: TournamentStatus.DRAFT,
      });
      await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Torneio B',
        status: TournamentStatus.SCHEDULED,
      });
      await createTestTournament(prisma, {
        editionDisciplineId: tennisEditionDisciplineId,
        name: 'Torneio C',
        status: TournamentStatus.DRAFT,
      });
    });

    it('should list all tournaments in the edition without auth', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/tournaments`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(3);
    });

    it('should list tournaments filtered by status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/tournaments?status=${TournamentStatus.SCHEDULED}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Torneio B');
    });

    it('should list tournaments filtered by discipline', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/tournaments?disciplineId=${tennisDisciplineId}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Torneio C');
    });
  });

  describe('GET /api/v1/tournaments/:id', () => {
    it('should return a tournament details', async () => {
      const tournament = await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Torneio Teste',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournament.id}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.id).toBe(tournament.id);
      expect(res.body.data.name).toBe('Torneio Teste');
    });

    it('should return 404 for non-existent tournament', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tournaments/nonexistentid')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/tournaments/:id', () => {
    let tournamentId: string;

    beforeEach(async () => {
      const tournament = await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Torneio Original',
        format: TournamentFormat.SINGLE_ELIMINATION,
      });
      tournamentId = tournament.id;
    });

    it('should update tournament successfully when requested by authorized staff', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({
          name: 'Torneio Atualizado',
          format: TournamentFormat.LEAGUE_ONLY,
        })
        .expect(HttpStatus.OK);

      expect(res.body.data.name).toBe('Torneio Atualizado');
      expect(res.body.data.format).toBe(TournamentFormat.LEAGUE_ONLY);

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Tournament', entityId: tournamentId, action: 'UPDATE' },
      });
      expect(log).toBeDefined();
    });

    it('should return 403 when updating other discipline tournament', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send({ name: 'Hack Name' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 409 when changing name to an existing one in the same discipline/edition', async () => {
      await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Outro Nome',
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ name: 'Outro Nome' })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('PATCH /api/v1/tournaments/:id/status', () => {
    it('should transition status successfully through the state machine', async () => {
      const tournament = await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        status: TournamentStatus.DRAFT,
      });

      // DRAFT -> SCHEDULED
      let res = await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournament.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: TournamentStatus.SCHEDULED })
        .expect(HttpStatus.OK);
      expect(res.body.data.status).toBe(TournamentStatus.SCHEDULED);

      // SCHEDULED -> ONGOING
      res = await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournament.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: TournamentStatus.ONGOING })
        .expect(HttpStatus.OK);
      expect(res.body.data.status).toBe(TournamentStatus.ONGOING);

      // ONGOING -> FINISHED
      res = await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournament.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: TournamentStatus.FINISHED })
        .expect(HttpStatus.OK);
      expect(res.body.data.status).toBe(TournamentStatus.FINISHED);
    });

    it('should return 400 Bad Request when trying to transition to an invalid state', async () => {
      const tournament = await createTestTournament(prisma, {
        editionDisciplineId: futsalEditionDisciplineId,
        status: TournamentStatus.FINISHED,
      });

      // Try transition FINISHED -> DRAFT
      await request(app.getHttpServer())
        .patch(`/api/v1/tournaments/${tournament.id}/status`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ status: TournamentStatus.DRAFT })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
