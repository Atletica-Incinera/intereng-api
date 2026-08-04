import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { EditionStaffRoleType, TournamentFormat, PhaseType, MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationGuard } from './authorization.guard';
import { ScopeResolverService } from './scope-resolver.service';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { SCOPE_PARAM_KEY } from '../decorators/scope-param.decorator';

async function cleanDatabase(prisma: PrismaService) {
  await prisma.editionStaffRole.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.phase.deleteMany({});
  await prisma.tournament.deleteMany({});
  await prisma.editionDiscipline.deleteMany({});
  await prisma.discipline.deleteMany({});
  await prisma.competitionEdition.deleteMany({});
  await prisma.competition.deleteMany({});
  await prisma.staff.deleteMany({});
}

describe('AuthorizationGuard', () => {
  let guard: AuthorizationGuard;
  let prisma: PrismaService;
  let reflector: Reflector;

  // DB IDs
  let staffId: string;
  let editionId: string;
  let otherEditionId: string;
  let disciplineId: string;
  let otherDisciplineId: string;
  let matchId: string;
  let phaseId: string;
  let tournamentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/competitions?schema=public';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, Reflector, ScopeResolverService, AuthorizationGuard],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    reflector = module.get<Reflector>(Reflector);
    guard = module.get<AuthorizationGuard>(AuthorizationGuard);

    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create staff
    const staff = await prisma.staff.create({
      data: {
        name: 'Guard Test Staff',
        email: 'guard-test-staff@example.com',
        passwordHash: 'dummyhash',
      },
    });
    staffId = staff.id;

    // Create competition
    const competition = await prisma.competition.create({
      data: {
        name: 'Guard Test Competition',
        slug: 'guard-test-competition',
      },
    });

    // Create editions
    const edition = await prisma.competitionEdition.create({
      data: {
        competitionId: competition.id,
        year: 2026,
        name: 'Guard Test 2026',
        startDate: new Date('2026-10-12T00:00:00Z'),
        endDate: new Date('2026-10-19T00:00:00Z'),
      },
    });
    editionId = edition.id;

    const otherEdition = await prisma.competitionEdition.create({
      data: {
        competitionId: competition.id,
        year: 2027,
        name: 'Guard Test 2027',
        startDate: new Date('2027-10-12T00:00:00Z'),
        endDate: new Date('2027-10-19T00:00:00Z'),
      },
    });
    otherEditionId = otherEdition.id;

    // Create disciplines
    const discipline = await prisma.discipline.create({
      data: { name: 'Basketball', slug: 'basketball' },
    });
    disciplineId = discipline.id;

    const otherDiscipline = await prisma.discipline.create({
      data: { name: 'Soccer', slug: 'soccer' },
    });
    otherDisciplineId = otherDiscipline.id;

    // Link discipline to edition
    const ed = await prisma.editionDiscipline.create({
      data: { editionId: edition.id, disciplineId: discipline.id },
    });

    await prisma.editionDiscipline.create({
      data: { editionId: edition.id, disciplineId: otherDiscipline.id },
    });

    // Create tournament hierarchy
    const tournament = await prisma.tournament.create({
      data: {
        editionDisciplineId: ed.id,
        name: 'Basketball Tournament',
        format: TournamentFormat.SINGLE_ELIMINATION,
      },
    });
    tournamentId = tournament.id;

    const phase = await prisma.phase.create({
      data: {
        tournamentId: tournament.id,
        order: 1,
        name: 'Semifinal',
        type: PhaseType.KNOCKOUT,
      },
    });
    phaseId = phase.id;

    const match = await prisma.match.create({
      data: {
        phaseId: phase.id,
        status: MatchStatus.SCHEDULED,
      },
    });
    matchId = match.id;
  });

  const createMockContext = (
    user: unknown,
    params: Record<string, string | undefined> = {},
    body: Record<string, unknown> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          body,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw UnauthorizedException if user is not authenticated', async () => {
    const ctx = createMockContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow SuperAdmin to pass regardless of role or scope', async () => {
    const ctx = createMockContext(
      { id: staffId, isSuperAdmin: true },
      { editionId: 'nonexistent' },
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.EDITION_ADMIN;
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny if staff has no role in the target edition', async () => {
    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { editionId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'editionId', entityType: 'edition' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('should allow EDITION_ADMIN to pass on EDITION_ADMIN required scope', async () => {
    // Add EDITION_ADMIN role
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        role: EditionStaffRoleType.EDITION_ADMIN,
      },
    });

    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { editionId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.EDITION_ADMIN;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'editionId', entityType: 'edition' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny DISCIPLINE_MANAGER on EDITION_ADMIN required scope', async () => {
    // Add DISCIPLINE_MANAGER role
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { editionId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.EDITION_ADMIN;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'editionId', entityType: 'edition' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('should allow EDITION_ADMIN to pass on DISCIPLINE_MANAGER required scope (inheritance)', async () => {
    // Add EDITION_ADMIN role
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        role: EditionStaffRoleType.EDITION_ADMIN,
      },
    });

    const ctx = createMockContext(
      { id: staffId, isSuperAdmin: false },
      { editionId, disciplineId },
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'disciplineId', entityType: 'discipline' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should allow DISCIPLINE_MANAGER to pass on their own discipline', async () => {
    // Add DISCIPLINE_MANAGER role for target discipline
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    const ctx = createMockContext(
      { id: staffId, isSuperAdmin: false },
      { editionId, disciplineId },
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'disciplineId', entityType: 'discipline' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should deny DISCIPLINE_MANAGER on a different discipline in the same edition', async () => {
    // Add DISCIPLINE_MANAGER role for target discipline
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    // Check against otherDisciplineId
    const ctx = createMockContext(
      { id: staffId, isSuperAdmin: false },
      { editionId, disciplineId: otherDisciplineId },
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'disciplineId', entityType: 'discipline' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('should deny DISCIPLINE_MANAGER on a different edition', async () => {
    // Add DISCIPLINE_MANAGER role for target discipline in editionId
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    // Request targets otherEditionId
    const ctx = createMockContext(
      { id: staffId, isSuperAdmin: false },
      { editionId: otherEditionId, disciplineId },
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'disciplineId', entityType: 'discipline' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('should resolve matchId to check authorization', async () => {
    // Add DISCIPLINE_MANAGER role for the discipline linked to the match
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { matchId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'matchId', entityType: 'match' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should resolve phaseId to check authorization', async () => {
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { phaseId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'phaseId', entityType: 'phase' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should resolve tournamentId to check authorization', async () => {
    const edDiscipline = await prisma.editionDiscipline.findFirst({
      where: { editionId, disciplineId },
    });
    await prisma.editionStaffRole.create({
      data: {
        staffId,
        editionId,
        editionDisciplineId: edDiscipline.id,
        role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      },
    });

    const ctx = createMockContext({ id: staffId, isSuperAdmin: false }, { tournamentId });
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === REQUIRE_ROLE_KEY) return EditionStaffRoleType.DISCIPLINE_MANAGER;
      if (key === SCOPE_PARAM_KEY) return { paramName: 'tournamentId', entityType: 'tournament' };
      return undefined;
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});
