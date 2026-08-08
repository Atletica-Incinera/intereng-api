/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient, EditionStaffRoleType, PhaseType } from '@prisma/client';
import {
  createTestStaff,
  createTestCompetition,
  createTestCompetitionEdition,
  createTestEditionStaffRole,
  createTestDiscipline,
  createTestEditionDiscipline,
  createTestTournament,
  createTestTournamentEntry,
  createTestPhase,
  createTestGroup,
} from './factories';
import * as bcrypt from 'bcryptjs';

describe('Phases & Groups Module (e2e)', () => {
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
  let futsalTournamentId: string;

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

    // Create a Tournament for Futsal
    const tournament = await createTestTournament(prisma, {
      editionDisciplineId: futsalEditionDisciplineId,
      name: 'Torneio Futsal',
    });
    futsalTournamentId = tournament.id;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/tournaments/:tournamentId/phases', () => {
    const validGroupPayload = {
      order: 1,
      name: 'Fase de Grupos',
      type: PhaseType.GROUP,
      config: {
        advanceCount: 2,
        tiebreakers: ['points', 'headToHead', 'goalDiff'],
      },
    };

    it('should create a phase successfully when requested by SuperAdmin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe(validGroupPayload.name);
      expect(res.body.data.order).toBe(validGroupPayload.order);
      expect(res.body.data.type).toBe(validGroupPayload.type);
      expect(res.body.data.config).toEqual(validGroupPayload.config);

      // Verify audit log
      const createdPhaseId = (res.body as { data: { id: string } }).data.id;
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Phase', entityId: createdPhaseId },
      });
      expect(log).toBeDefined();
      expect(log?.action).toBe('CREATE');
    });

    it('should create a phase successfully when requested by EDITION_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${editionAdminToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.name).toBe(validGroupPayload.name);
    });

    it('should create a phase successfully when requested by the correct DISCIPLINE_MANAGER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.CREATED);

      expect(res.body.data.name).toBe(validGroupPayload.name);
    });

    it('should fail with 403 when requested by other DISCIPLINE_MANAGER', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${otherDisciplineManagerToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 403 when requested by regular staff', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${regularStaffToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with 400 when config is missing for GROUP phase type', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          order: 1,
          name: 'Fase de Grupos',
          type: PhaseType.GROUP,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 400 when config has invalid fields for GROUP phase type', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          order: 1,
          name: 'Fase de Grupos',
          type: PhaseType.GROUP,
          config: {
            advanceCount: -1, // Invalid: must be >= 1
            tiebreakers: ['points'],
          },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 400 when config has extra fields for KNOCKOUT phase type', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          order: 1,
          name: 'Mata-mata',
          type: PhaseType.KNOCKOUT,
          config: {
            advanceCount: 2, // KNOCKOUT config should be empty
          },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should create KNOCKOUT phase successfully with config: {}', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          order: 1,
          name: 'Mata-mata',
          type: PhaseType.KNOCKOUT,
          config: {},
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.type).toBe(PhaseType.KNOCKOUT);
      expect(res.body.data.config).toEqual({});
    });

    it('should fail with 409 when phase with same order already exists in the tournament', async () => {
      await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        order: 1,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validGroupPayload)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('GET /api/v1/tournaments/:tournamentId/phases', () => {
    beforeEach(async () => {
      await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        order: 2,
        name: 'Mata-mata',
        type: PhaseType.KNOCKOUT,
        config: {},
      });
      await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        order: 1,
        name: 'Fase de Grupos',
        type: PhaseType.GROUP,
        config: { advanceCount: 2, tiebreakers: ['points'] },
      });
    });

    it('should retrieve all phases ordered by order field', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${futsalTournamentId}/phases`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].order).toBe(1);
      expect(res.body.data[0].name).toBe('Fase de Grupos');
      expect(res.body.data[1].order).toBe(2);
      expect(res.body.data[1].name).toBe('Mata-mata');
    });
  });

  describe('POST /api/v1/phases/:phaseId/groups', () => {
    let phaseId: string;

    beforeEach(async () => {
      const phase = await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        type: PhaseType.GROUP,
      });
      phaseId = phase.id;
    });

    it('should create a group successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/groups`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ name: 'Grupo A' })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Grupo A');
      expect(res.body.data.phaseId).toBe(phaseId);

      // Verify audit log
      const createdGroupId = (res.body as { data: { id: string } }).data.id;
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'Group', entityId: createdGroupId },
      });
      expect(log).toBeDefined();
    });

    it('should fail with 409 when group name already exists in the same phase', async () => {
      await createTestGroup(prisma, {
        phaseId,
        name: 'Grupo A',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/phases/${phaseId}/groups`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ name: 'Grupo A' })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('POST /api/v1/groups/:groupId/entries', () => {
    let groupId: string;
    let entryId: string;

    beforeEach(async () => {
      const phase = await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        order: 1,
        name: 'Fase 1',
        type: PhaseType.GROUP,
      });
      const group = await createTestGroup(prisma, {
        phaseId: phase.id,
      });
      groupId = group.id;

      const entry = await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
      });
      entryId = entry.id;
    });

    it('should add entry to group successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/entries`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ entryId })
        .expect(HttpStatus.CREATED);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.groupId).toBe(groupId);
      expect(res.body.data.entryId).toBe(entryId);

      // Verify audit log
      const createdGroupEntryId = (res.body as { data: { id: string } }).data.id;
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'GroupEntry', entityId: createdGroupEntryId },
      });
      expect(log).toBeDefined();
    });

    it('should fail with 400 when entry belongs to another tournament', async () => {
      // Create another tournament in the database
      const otherTournament = await createTestTournament(prisma, {
        editionDisciplineId: tennisEditionDisciplineId,
        name: 'Torneio Tennis',
      });
      const otherEntry = await createTestTournamentEntry(prisma, {
        tournamentId: otherTournament.id,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/entries`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ entryId: otherEntry.id })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with 409 when entry is already in the group', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/entries`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ entryId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/entries`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .send({ entryId })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('DELETE /api/v1/groups/:groupId/entries/:entryId', () => {
    let groupId: string;
    let entryId: string;

    beforeEach(async () => {
      const phase = await createTestPhase(prisma, {
        tournamentId: futsalTournamentId,
        order: 1,
        name: 'Fase 1',
        type: PhaseType.GROUP,
      });
      const group = await createTestGroup(prisma, {
        phaseId: phase.id,
      });
      groupId = group.id;

      const entry = await createTestTournamentEntry(prisma, {
        tournamentId: futsalTournamentId,
      });
      entryId = entry.id;

      // Allocate entry
      await prisma.groupEntry.create({
        data: {
          groupId,
          entryId,
        },
      });
    });

    it('should remove entry from group successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${groupId}/entries/${entryId}`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify it was deleted from db
      const entryInDb = await prisma.groupEntry.findUnique({
        where: {
          groupId_entryId: {
            groupId,
            entryId,
          },
        },
      });
      expect(entryInDb).toBeNull();

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityType: 'GroupEntry', action: 'DELETE' },
      });
      expect(log).toBeDefined();
    });

    it('should fail with 404 when group entry does not exist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${groupId}/entries/nonexistent`)
        .set('Authorization', `Bearer ${disciplineManagerToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
