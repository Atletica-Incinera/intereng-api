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
  createTestTeam,
  createTestAthlete,
  createTestEditionDiscipline,
  createTestDiscipline,
} from './factories';
import * as bcrypt from 'bcryptjs';
import { storeDocument } from '../src/catalog/security.utils';

describe('Catalog Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;
  let disciplineManagerToken: string;

  // IDs
  let editionId: string;
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

    // Login helper to set tokens
    login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: rawPassword })
        .expect(HttpStatus.OK);
      return response.body.data.accessToken;
    };

    superAdminToken = await login(superAdmin.email);
    regularStaffToken = await login(regularStaff.email);
    editionAdminToken = await login(editionAdmin.email);
    disciplineManagerToken = await login(disciplineManager.email);

    // Setup Competitions, Editions and Roles
    const competition = await createTestCompetition(prisma);
    const edition = await createTestCompetitionEdition(prisma, { competitionId: competition.id });
    editionId = edition.id;

    const otherCompetition = await createTestCompetition(prisma);
    const otherEdition = await createTestCompetitionEdition(prisma, {
      competitionId: otherCompetition.id,
    });

    // Set roles
    await createTestEditionStaffRole(prisma, {
      editionId: edition.id,
      staffId: editionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
    });

    await createTestEditionStaffRole(prisma, {
      editionId: otherEdition.id,
      staffId: otherEditionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
    });

    const disc = await createTestDiscipline(prisma);
    disciplineId = disc.id;

    const edDisc = await createTestEditionDiscipline(prisma, {
      editionId: edition.id,
      disciplineId: disc.id,
    });

    await createTestEditionStaffRole(prisma, {
      editionId: edition.id,
      staffId: disciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: edDisc.id,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Teams Catalog', () => {
    it('should block non-admins from creating a team', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({ name: 'Futsal CIn', slug: 'futsal-cin' })
        .expect(HttpStatus.FORBIDDEN);

      await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ name: 'Futsal CIn', slug: 'futsal-cin' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow EDITION_ADMIN and SuperAdmin to create a team', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ name: 'Team CIn', slug: 'team-cin' })
        .expect(HttpStatus.CREATED);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Team CIn');
      expect(response.body.data.slug).toBe('team-cin');

      await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Team Area II', slug: 'team-area-ii' })
        .expect(HttpStatus.CREATED);
    });

    it('should enforce unique constraint on team slug', async () => {
      await createTestTeam(prisma, { slug: 'team-cin' });

      await request(app.getHttpServer())
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({ name: 'Another Team', slug: 'team-cin' })
        .expect(HttpStatus.CONFLICT);
    });

    it('should list teams with pagination and search', async () => {
      await createTestTeam(prisma, { name: 'Alpha', slug: 'alpha' });
      await createTestTeam(prisma, { name: 'Project', slug: 'project' });
      await createTestTeam(prisma, { name: 'Gamma', slug: 'gamma' });

      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/teams?search=a')
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.OK);

      expect(listResponse.body.data.length).toBe(2); // Alpha, Gamma
      expect(listResponse.body.meta.total).toBe(2);
    });

    it('should retrieve a team by ID', async () => {
      const team = await createTestTeam(prisma);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/teams/${team.id}`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.data.id).toBe(team.id);
    });
  });

  describe('Athletes Catalog', () => {
    it('should block non-admins from creating an athlete', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/athletes')
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send({
          name: 'João Silva',
          document: '123.456.789-00',
          birthDate: '2000-01-01',
          email: 'joao@example.com',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow EDITION_ADMIN and SuperAdmin to create an athlete', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/athletes')
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          name: 'João Silva',
          document: '123.456.789-00',
          birthDate: '2000-01-01',
          email: 'joao@example.com',
        })
        .expect(HttpStatus.CREATED);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('João Silva');
      expect(response.body.data.document).toBe('123.456.789-00'); // EDITION_ADMIN sees full doc
    });

    it('should enforce unique constraint on athlete document', async () => {
      const doc = '123.456.789-00';
      await createTestAthlete(prisma, { document: storeDocument(doc) });

      await request(app.getHttpServer())
        .post('/api/v1/athletes')
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          name: 'Another João',
          document: doc,
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should return masked documents to non-admins and full documents to admins', async () => {
      const doc = '123.456.789-00';
      const athlete = await createTestAthlete(prisma, {
        name: 'João Silva',
        document: storeDocument(doc),
      });

      // Admin (EDITION_ADMIN)
      const resAdmin = await request(app.getHttpServer())
        .get(`/api/v1/athletes/${athlete.id}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.OK);
      expect(resAdmin.body.data.document).toBe(doc);

      // Non-Admin (DISCIPLINE_MANAGER)
      const resDM = await request(app.getHttpServer())
        .get(`/api/v1/athletes/${athlete.id}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.OK);
      expect(resDM.body.data.document).toBe('***.456.***-**');
    });

    it('should retrieve athlete history', async () => {
      const athlete = await createTestAthlete(prisma);

      // Create an EditionRoster entry
      const team = await createTestTeam(prisma);
      const edDisc = await prisma.editionDiscipline.findFirst({
        where: { editionId, disciplineId },
      });

      await prisma.editionRoster.create({
        data: {
          editionDisciplineId: edDisc!.id,
          athleteId: athlete.id,
          teamId: team.id,
          jerseyNumber: 10,
          status: 'ACTIVE',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/athletes/${athlete.id}/history`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].jerseyNumber).toBe(10);
      expect(response.body.data[0].teamName).toBe(team.name);
    });
  });
});
