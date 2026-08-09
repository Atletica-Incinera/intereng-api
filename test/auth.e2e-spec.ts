import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetitionEdition,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestEditionStaffRole,
} from './factories';
import * as bcrypt from 'bcryptjs';

interface ApiResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    staff: {
      id: string;
      name: string;
      email: string;
      isSuperAdmin: boolean;
    };
    id?: string;
    name?: string;
    email?: string;
    isSuperAdmin?: boolean;
    editionRoles?: Array<{
      editionId: string;
      editionName: string;
      disciplineId: string | null;
      disciplineName: string | null;
      role: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

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
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/login - should log in successfully and return tokens', async () => {
    const rawPassword = 'my-secret-password-123';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const staff = await createTestStaff(prisma, {
      email: 'coordinator@ufpe.br',
      passwordHash,
      name: 'Ana Coordenadora',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator@ufpe.br',
        password: rawPassword,
      })
      .expect(200);

    const body = response.body as ApiResponse;
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.staff.email).toBe(staff.email);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('POST /api/v1/auth/login - should fail with wrong credentials', async () => {
    const rawPassword = 'my-secret-password-123';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await createTestStaff(prisma, {
      email: 'coordinator@ufpe.br',
      passwordHash,
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator@ufpe.br',
        password: 'wrong-password',
      })
      .expect(401);

    const body = response.body as ApiResponse;
    expect(body.error?.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/auth/me - should return logged in staff information with roles', async () => {
    const rawPassword = 'my-secret-password-123';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const staff = await createTestStaff(prisma, {
      email: 'coordinator@ufpe.br',
      passwordHash,
      name: 'Ana Coordenadora',
    });

    // Create edition, discipline and role
    const edition = await createTestCompetitionEdition(prisma, {
      name: 'Jogos de Engenharia 2026',
    });
    const discipline = await createTestDiscipline(prisma, {
      name: 'Futsal',
    });
    const editionDiscipline = await createTestEditionDiscipline(prisma, {
      editionId: edition.id,
      disciplineId: discipline.id,
    });
    await createTestEditionStaffRole(prisma, {
      editionId: edition.id,
      staffId: staff.id,
      editionDisciplineId: editionDiscipline.id,
      role: 'DISCIPLINE_MANAGER',
    });

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator@ufpe.br',
        password: rawPassword,
      })
      .expect(200);

    const loginBody = loginRes.body as ApiResponse;
    const accessToken = loginBody.data.accessToken;

    // Get me
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const meBody = meRes.body as ApiResponse;
    expect(meBody.data.email).toBe(staff.email);
    expect(meBody.data.editionRoles).toHaveLength(1);
    expect(meBody.data.editionRoles?.[0]).toEqual({
      editionId: edition.id,
      editionName: 'Jogos de Engenharia 2026',
      disciplineId: discipline.id,
      disciplineName: 'Futsal',
      role: 'DISCIPLINE_MANAGER',
    });
  });

  it('POST /api/v1/auth/refresh - should refresh accessToken using body and cookie', async () => {
    const rawPassword = 'my-secret-password-123';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await createTestStaff(prisma, {
      email: 'coordinator@ufpe.br',
      passwordHash,
    });

    // Login to get refresh token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator@ufpe.br',
        password: rawPassword,
      })
      .expect(200);

    const loginBody = loginRes.body as ApiResponse;
    const refreshToken = loginBody.data.refreshToken;
    const cookies = loginRes.headers['set-cookie'] as string[];

    // Refresh using body
    const refreshBodyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const refreshBody = refreshBodyRes.body as ApiResponse;
    expect(refreshBody.data).toHaveProperty('accessToken');
    expect(refreshBody.data).toHaveProperty('refreshToken');

    // Refresh using cookie
    const refreshCookieRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .send()
      .expect(200);

    const refreshCookie = refreshCookieRes.body as ApiResponse;
    expect(refreshCookie.data).toHaveProperty('accessToken');
    expect(refreshCookie.data).toHaveProperty('refreshToken');
  });

  it('POST /api/v1/auth/logout - should log out successfully and clear cookie', async () => {
    const rawPassword = 'my-secret-password-123';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    await createTestStaff(prisma, {
      email: 'coordinator@ufpe.br',
      passwordHash,
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator@ufpe.br',
        password: rawPassword,
      })
      .expect(200);

    const loginBody = loginRes.body as ApiResponse;
    const accessToken = loginBody.data.accessToken;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const cookies = logoutRes.headers['set-cookie'] as string[];
    expect(cookies[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
