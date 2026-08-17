import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv, MOCK_PASSWORD_HASH } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, EditionStaffRoleType } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
  createTestDiscipline,
  createTestEditionDiscipline,
} from './factories';

describe('Disciplines Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;
  let otherEditionAdminToken: string;
  let disciplineManagerToken: string;

  // IDs
  let superAdminId: string;
  let editionAdminId: string;
  let disciplineManagerId: string;
  let editionId: string;
  let otherEditionId: string;
  let disciplineId: string;

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
    const passwordHash = MOCK_PASSWORD_HASH;

    const superAdmin = await createTestStaff(prisma, {
      email: 'superadmin@example.com',
      passwordHash,
      isSuperAdmin: true,
    });
    superAdminId = superAdmin.id;

    const regularStaff = await createTestStaff(prisma, {
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
    otherEditionAdminToken = await login('otheredadmin@example.com');
    disciplineManagerToken = await login('discmanager@example.com');

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

    // Create a base discipline
    const discipline = await createTestDiscipline(prisma, {
      name: 'Futsal',
      slug: 'futsal',
      isIndividual: false,
    });
    disciplineId = discipline.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /disciplines', () => {
    it('should list disciplines with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/disciplines')
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta).toBeDefined();
    });
  });

  describe('POST /disciplines', () => {
    it('should allow SuperAdmin to create a discipline', async () => {
      const payload = {
        name: 'Vôlei de Praia',
        slug: 'volei-de-praia',
        isIndividual: false,
        description: 'Vôlei de areia em dupla',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/disciplines')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.slug).toBe(payload.slug);

      // Check Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CREATE', entityType: 'Discipline' },
      });
      expect(audit).toBeDefined();
      expect(audit?.staffId).toBe(superAdminId);
    });

    it('should allow EditionAdmin to create a discipline in the global catalog', async () => {
      const payload = {
        name: 'Tênis',
        slug: 'tenis',
        isIndividual: true,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/disciplines')
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.slug).toBe(payload.slug);
    });

    it('should deny non-admin staff from creating a discipline', async () => {
      const payload = {
        name: 'Basquete',
        slug: 'basquete',
      };

      await request(app.getHttpServer())
        .post('/api/v1/disciplines')
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send(payload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 409 Conflict if discipline slug already exists', async () => {
      const payload = {
        name: 'Futsal duplicado',
        slug: 'futsal',
      };

      await request(app.getHttpServer())
        .post('/api/v1/disciplines')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('GET /editions/:editionId/disciplines', () => {
    it('should return public list of disciplines associated with edition', async () => {
      // Associate first
      await createTestEditionDiscipline(prisma, {
        editionId,
        disciplineId,
        config: { matchDurationMinutes: 40 },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/disciplines`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].disciplineName).toBe('Futsal');
      expect(res.body.data[0].config).toEqual({ matchDurationMinutes: 40 });
    });

    it('should return 404 if edition does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/editions/non-existent-edition/disciplines')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /editions/:editionId/disciplines', () => {
    it('should allow EDITION_ADMIN to associate a discipline', async () => {
      const payload = {
        disciplineId,
        config: { matchDurationMinutes: 40 },
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/disciplines`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.disciplineId).toBe(disciplineId);
      expect(res.body.data.config).toEqual(payload.config);

      // Check Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CREATE', entityType: 'EditionDiscipline', editionId },
      });
      expect(audit).toBeDefined();
      expect(audit?.staffId).toBe(editionAdminId);
    });

    it('should deny EDITION_ADMIN from another edition', async () => {
      const payload = {
        disciplineId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/disciplines`)
        .set('Authorization', `Bearer ${otherEditionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 if discipline does not exist', async () => {
      const payload = {
        disciplineId: 'invalid-disc-id',
      };

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/disciplines`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 409 Conflict if already associated', async () => {
      await createTestEditionDiscipline(prisma, {
        editionId,
        disciplineId,
      });

      const payload = {
        disciplineId,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/disciplines`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.CONFLICT);
    });

    it('should validate config schema correctly (e.g. Volleyball)', async () => {
      const volley = await createTestDiscipline(prisma, {
        name: 'Vôlei',
        slug: 'volei',
      });

      const payload = {
        disciplineId: volley.id,
        config: { setsToWin: 'invalid', pointsPerSet: 25 }, // setsToWin must be a number
      };

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/disciplines`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(payload)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /editions/:editionId/disciplines/:id', () => {
    let edDiscId: string;

    beforeEach(async () => {
      const edDisc = await createTestEditionDiscipline(prisma, {
        editionId,
        disciplineId,
        config: { matchDurationMinutes: 40 },
      });
      edDiscId = edDisc.id;

      // Assign DISCIPLINE_MANAGER
      await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: disciplineManagerId,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
        editionDisciplineId: edDiscId,
      });
    });

    it('should allow DISCIPLINE_MANAGER to update config', async () => {
      const payload = {
        config: { matchDurationMinutes: 30 },
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/disciplines/${edDiscId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(HttpStatus.OK);

      expect(res.body.data.config).toEqual(payload.config);

      // Check Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'UPDATE', entityType: 'EditionDiscipline', entityId: edDiscId },
      });
      expect(audit).toBeDefined();
      expect(audit?.staffId).toBe(disciplineManagerId);
    });

    it('should deny DISCIPLINE_MANAGER of another discipline or edition', async () => {
      // Create a manager for another discipline
      const otherManager = await createTestStaff(prisma, {
        email: 'othermgr@example.com',
        passwordHash: MOCK_PASSWORD_HASH,
      });

      const otherEdDisc = await createTestEditionDiscipline(prisma, {
        editionId,
        config: null,
      });

      await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: otherManager.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
        editionDisciplineId: otherEdDisc.id,
      });

      const otherMgrToken = await login('othermgr@example.com');

      const payload = {
        config: { matchDurationMinutes: 30 },
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/disciplines/${edDiscId}`)
        .set('Authorization', `Bearer ${otherMgrToken}`)
        .send(payload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should validate config schema correctly on update', async () => {
      const payload = {
        config: { matchDurationMinutes: -5 }, // Must be positive/at least 1
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/disciplines/${edDiscId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(payload)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /editions/:editionId/disciplines/:disciplineId', () => {
    beforeEach(async () => {
      await createTestEditionDiscipline(prisma, {
        editionId,
        disciplineId,
      });
    });

    it('should allow EDITION_ADMIN to delete the association', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/disciplines/${disciplineId}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);

      const edDisc = await prisma.editionDiscipline.findFirst({
        where: { editionId, disciplineId },
      });
      expect(edDisc).toBeNull();

      // Check Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'DELETE', entityType: 'EditionDiscipline', editionId },
      });
      expect(audit).toBeDefined();
    });

    it('should deny DISCIPLINE_MANAGER from deleting the association', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/disciplines/${disciplineId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
