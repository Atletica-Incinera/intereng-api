/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestEditionStaffRole,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Edition Staff Roles Module (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  // Tokens
  let superAdminToken: string;
  let regularStaffToken: string;
  let editionAdminToken: string;

  // IDs
  let editionAdminId: string;
  let editionId: string;
  let otherEditionId: string;
  let disciplineId: string;
  let otherDisciplineId: string;
  let editionDisciplineId: string;

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

    // Global super admin
    await createTestStaff(prisma, {
      email: 'superadmin@example.com',
      passwordHash,
      isSuperAdmin: true,
    });

    // Regular staff member
    await createTestStaff(prisma, {
      email: 'staff@example.com',
      passwordHash,
      isSuperAdmin: false,
    });

    // Staff for edition admin
    const editionAdmin = await createTestStaff(prisma, {
      email: 'edadmin@example.com',
      passwordHash,
      isSuperAdmin: false,
    });
    editionAdminId = editionAdmin.id;

    // Staff for another edition admin
    await createTestStaff(prisma, {
      email: 'otheredadmin@example.com',
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

    // Setup base competition & edition
    const competition = await createTestCompetition(prisma, {
      name: 'Intereng',
      slug: 'intereng',
    });

    const edition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2026,
      name: 'Intereng 2026',
    });
    editionId = edition.id;

    const otherEdition = await createTestCompetitionEdition(prisma, {
      competitionId: competition.id,
      year: 2027,
      name: 'Intereng 2027',
    });
    otherEditionId = otherEdition.id;

    // Setup discipline
    const discipline = await createTestDiscipline(prisma, {
      name: 'Futsal',
      slug: 'futsal',
    });
    disciplineId = discipline.id;

    const otherDiscipline = await createTestDiscipline(prisma, {
      name: 'Handball',
      slug: 'handball',
    });
    otherDisciplineId = otherDiscipline.id;

    // Associate discipline to edition
    const edDisc = await createTestEditionDiscipline(prisma, {
      editionId,
      disciplineId,
    });
    editionDisciplineId = edDisc.id;

    // Assign edadmin@example.com as EDITION_ADMIN of editionId
    await createTestEditionStaffRole(prisma, {
      editionId,
      staffId: editionAdminId,
      role: 'EDITION_ADMIN',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /editions/:editionId/staff-roles', () => {
    it('should list all staff roles for an edition if requester is EDITION_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].role).toBe('EDITION_ADMIN');
      expect(res.body.data[0].staffId).toBe(editionAdminId);
    });

    it('should list all staff roles for an edition if requester is SuperAdmin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
    });

    it('should deny access if requester is regular staff', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 if edition does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/editions/nonexistent-id/staff-roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /editions/:editionId/staff-roles', () => {
    it('should allow SuperAdmin to create an EDITION_ADMIN role', async () => {
      const targetStaff = await createTestStaff(prisma);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'EDITION_ADMIN',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.role).toBe('EDITION_ADMIN');
      expect(res.body.data.staffId).toBe(targetStaff.id);
      expect(res.body.data.disciplineId).toBeNull();
    });

    it('should forbid EDITION_ADMIN from creating another EDITION_ADMIN role', async () => {
      const targetStaff = await createTestStaff(prisma);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'EDITION_ADMIN',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow EDITION_ADMIN to create a DISCIPLINE_MANAGER role', async () => {
      const targetStaff = await createTestStaff(prisma);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'DISCIPLINE_MANAGER',
          disciplineId,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.role).toBe('DISCIPLINE_MANAGER');
      expect(res.body.data.staffId).toBe(targetStaff.id);
      expect(res.body.data.disciplineId).toBe(disciplineId);
    });

    it('should deny DISCIPLINE_MANAGER creation if discipline is not associated to edition', async () => {
      const targetStaff = await createTestStaff(prisma);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'DISCIPLINE_MANAGER',
          disciplineId: otherDisciplineId, // not associated
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should deny DISCIPLINE_MANAGER creation if disciplineId is missing', async () => {
      const targetStaff = await createTestStaff(prisma);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'DISCIPLINE_MANAGER',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should deny EDITION_ADMIN creation if disciplineId is provided', async () => {
      const targetStaff = await createTestStaff(prisma);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'EDITION_ADMIN',
          disciplineId,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 409 Conflict if role assignment is duplicated', async () => {
      const targetStaff = await createTestStaff(prisma);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'DISCIPLINE_MANAGER',
          disciplineId,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/editions/${editionId}/staff-roles`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send({
          staffId: targetStaff.id,
          role: 'DISCIPLINE_MANAGER',
          disciplineId,
        })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('DELETE /editions/:editionId/staff-roles/:id', () => {
    it('should allow SuperAdmin to revoke EDITION_ADMIN role', async () => {
      const targetStaff = await createTestStaff(prisma);
      const role = await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: targetStaff.id,
        role: 'EDITION_ADMIN',
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/${role.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should forbid EDITION_ADMIN from revoking EDITION_ADMIN role', async () => {
      const targetStaff = await createTestStaff(prisma);
      const role = await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: targetStaff.id,
        role: 'EDITION_ADMIN',
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/${role.id}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow EDITION_ADMIN to revoke DISCIPLINE_MANAGER role', async () => {
      const targetStaff = await createTestStaff(prisma);
      const role = await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: targetStaff.id,
        role: 'DISCIPLINE_MANAGER',
        editionDisciplineId,
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/${role.id}`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should forbid regular staff from revoking DISCIPLINE_MANAGER role', async () => {
      const targetStaff = await createTestStaff(prisma);
      const role = await createTestEditionStaffRole(prisma, {
        editionId,
        staffId: targetStaff.id,
        role: 'DISCIPLINE_MANAGER',
        editionDisciplineId,
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/${role.id}`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 400 if role belongs to another edition', async () => {
      const targetStaff = await createTestStaff(prisma);
      const role = await createTestEditionStaffRole(prisma, {
        editionId: otherEditionId,
        staffId: targetStaff.id,
        role: 'DISCIPLINE_MANAGER',
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/${role.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 404 if role does not exist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/editions/${editionId}/staff-roles/nonexistent-id`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
