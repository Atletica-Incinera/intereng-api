import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, EditionStatus, EditionStaffRoleType } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Competitions & Editions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;

  // IDs
  let superAdminId: string;
  let regularStaffId: string;
  let editionAdminId: string;
  let competitionId: string;
  let editionId: string;

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
    regularStaffId = regularStaff.id;

    const editionAdmin = await createTestStaff(prisma, {
      email: 'edadmin@example.com',
      passwordHash,
      isSuperAdmin: false,
    });
    editionAdminId = editionAdmin.id;

    // Login helper to set tokens
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: rawPassword });
      return res.body.data.accessToken as string;
    };

    superAdminToken = await login('superadmin@example.com');
    regularStaffToken = await login('staff@example.com');
    editionAdminToken = await login('edadmin@example.com');

    // Create a base competition and edition
    const competition = await createTestCompetition(prisma, {
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
    });
    competitionId = competition.id;

    const edition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2026,
      name: 'Jogos de Engenharia 2026',
      startDate: new Date('2026-10-12T00:00:00Z'),
      endDate: new Date('2026-10-19T00:00:00Z'),
      status: EditionStatus.PLANNING,
    });
    editionId = edition.id;

    // Assign EDITION_ADMIN role to editionAdmin for this edition
    await createTestEditionStaffRole(prisma, {
      editionId: edition.id,
      staffId: editionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Competitions CRUD', () => {
    it('GET /api/v1/competitions - should list competitions paginated', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/competitions').expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe('jogos-de-engenharia');
      expect(res.body.meta).toBeDefined();
    });

    it('POST /api/v1/competitions - should fail when unauthorized or not superadmin', async () => {
      // No token
      await request(app.getHttpServer())
        .post('/api/v1/competitions')
        .send({ name: 'Olimpíada', slug: 'olimpiada' })
        .expect(401);

      // Not super admin
      await request(app.getHttpServer())
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({ name: 'Olimpíada', slug: 'olimpiada' })
        .expect(403);
    });

    it('POST /api/v1/competitions - should succeed when superadmin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Olimpíada UPE', slug: 'olimpiada-upe' })
        .expect(201);

      expect(res.body.data.slug).toBe('olimpiada-upe');
      expect(res.body.data.id).toBeDefined();
    });

    it('POST /api/v1/competitions - should fail on duplicate slug', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/competitions')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Jogos de Engenharia Duplicado', slug: 'jogos-de-engenharia' })
        .expect(409);
    });

    it('GET /api/v1/competitions/:id - should get a competition', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/competitions/${competitionId}`)
        .expect(200);

      expect(res.body.data.id).toBe(competitionId);
      expect(res.body.data.slug).toBe('jogos-de-engenharia');
    });

    it('GET /api/v1/competitions/:id - should return 404 for invalid id', async () => {
      await request(app.getHttpServer()).get('/api/v1/competitions/non-existent-id').expect(404);
    });
  });

  describe('Editions CRUD', () => {
    it('POST /api/v1/competitions/:id/editions - should fail when unauthorized or not superadmin', async () => {
      const payload = {
        year: 2027,
        name: 'Jogos de Engenharia 2027',
        startDate: '2027-10-12T00:00:00Z',
        endDate: '2027-10-19T00:00:00Z',
      };

      await request(app.getHttpServer())
        .post(`/api/v1/competitions/${competitionId}/editions`)
        .send(payload)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/v1/competitions/${competitionId}/editions`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send(payload)
        .expect(403);
    });

    it('POST /api/v1/competitions/:id/editions - should succeed when superadmin', async () => {
      const payload = {
        year: 2027,
        name: 'Jogos de Engenharia 2027',
        startDate: '2027-10-12T00:00:00Z',
        endDate: '2027-10-19T00:00:00Z',
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/competitions/${competitionId}/editions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.data.year).toBe(2027);
      expect(res.body.data.status).toBe(EditionStatus.PLANNING);
    });

    it('POST /api/v1/competitions/:id/editions - should fail on duplicate year', async () => {
      const payload = {
        year: 2026, // existing edition year
        name: 'Jogos de Engenharia 2026 Duplicado',
        startDate: '2026-10-12T00:00:00Z',
        endDate: '2026-10-19T00:00:00Z',
      };

      await request(app.getHttpServer())
        .post(`/api/v1/competitions/${competitionId}/editions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(409);
    });

    it('POST /api/v1/competitions/:id/editions - should fail on endDate <= startDate', async () => {
      const payload = {
        year: 2028,
        name: 'Jogos de Engenharia 2028',
        startDate: '2028-10-19T00:00:00Z',
        endDate: '2028-10-12T00:00:00Z', // before start
      };

      await request(app.getHttpServer())
        .post(`/api/v1/competitions/${competitionId}/editions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(400);
    });

    it('GET /api/v1/competitions/:id/editions - should return editions list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/competitions/${competitionId}/editions`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(editionId);
    });

    it('GET /api/v1/editions/:editionId - should get edition details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}`)
        .expect(200);

      expect(res.body.data.id).toBe(editionId);
      expect(res.body.data.year).toBe(2026);
    });

    it('PATCH /api/v1/editions/:editionId - should fail when unauthorized or not admin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}`)
        .send({ name: 'Novo Nome' })
        .expect(401);

      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({ name: 'Novo Nome' })
        .expect(403);
    });

    it('PATCH /api/v1/editions/:editionId - should succeed for SuperAdmin or EDITION_ADMIN', async () => {
      // EDITION_ADMIN
      let res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ name: 'Novo Nome 1' })
        .expect(200);

      expect(res.body.data.name).toBe('Novo Nome 1');

      // SuperAdmin
      res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Novo Nome 2' })
        .expect(200);

      expect(res.body.data.name).toBe('Novo Nome 2');
    });

    it('PATCH /api/v1/editions/:editionId/status - should succeed for SuperAdmin or EDITION_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/status`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ status: EditionStatus.ONGOING })
        .expect(200);

      expect(res.body.data.status).toBe(EditionStatus.ONGOING);
    });

    it('PATCH /api/v1/editions/:editionId/status - should fail on invalid status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/editions/${editionId}/status`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });
  });
});
