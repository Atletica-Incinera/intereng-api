import { PrismaClient, Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';

let uniqueCounter = 0;

/**
 * Generates a unique ID string using a counter, timestamp, and random number.
 * Useful for fields requiring unique values (like slugs) to avoid database constraint violations.
 */
function getUniqueId(): string {
  uniqueCounter += 1;
  return `${uniqueCounter}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Generates an 11-character unique numeric string.
 * Typically used as unique document identifiers in test scenarios.
 */
function getUniqueDocument(): string {
  uniqueCounter += 1;
  const base = String(uniqueCounter).padStart(6, '0');
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `${base}${rand}`;
}

/**
 * Helper function to retrieve a provided dependency ID or automatically create one if missing.
 * Prevents repeating initialization blocks across factories, satisfying the DRY principle.
 *
 * @param providedId The optional caller-provided ID.
 * @param creator Function callback that creates the entity and returns its information.
 */
async function getOrInitDependency(
  providedId: string | undefined,
  creator: () => Promise<{ id: string }>,
): Promise<string> {
  if (providedId) {
    return providedId;
  }
  const dependency = await creator();
  return dependency.id;
}

/**
 * Creates and persists a test Competition record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestCompetition(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.CompetitionCreateInput>,
) {
  const name = overrides?.name || `Competition ${faker.company.name()}`;
  const slug = overrides?.slug || `competition-${getUniqueId()}`;
  return prisma.competition.create({
    data: {
      name,
      slug,
      ...overrides,
    },
  });
}

/**
 * Creates a test CompetitionEdition.
 *
 * @implicitBehavior If `overrides.competitionId` is not provided, this function will automatically
 * create a parent Competition via `createTestCompetition` and use its ID.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestCompetitionEdition(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.CompetitionEditionUncheckedCreateInput>,
) {
  const competitionId = await getOrInitDependency(overrides?.competitionId, () =>
    createTestCompetition(prisma),
  );

  const year =
    overrides?.year !== undefined ? overrides.year : faker.number.int({ min: 2000, max: 2100 });
  const name = overrides?.name || `Edition ${year} - ${getUniqueId()}`;
  const startDate = overrides?.startDate ? new Date(overrides.startDate) : faker.date.future();
  const endDate = overrides?.endDate
    ? new Date(overrides.endDate)
    : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  return prisma.competitionEdition.create({
    data: {
      competitionId,
      year,
      name,
      startDate,
      endDate,
      status: overrides?.status || 'PLANNING',
      ...overrides,
    },
  });
}

/**
 * Creates and persists a test Discipline record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestDiscipline(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.DisciplineCreateInput>,
) {
  const name = overrides?.name || `Discipline ${faker.lorem.word()} ${getUniqueId()}`;
  const slug = overrides?.slug || `discipline-${getUniqueId()}`;
  return prisma.discipline.create({
    data: {
      name,
      slug,
      isIndividual: overrides?.isIndividual !== undefined ? overrides.isIndividual : false,
      description: overrides?.description || faker.lorem.sentence(),
      ...overrides,
    },
  });
}

/**
 * Creates and persists a test Team record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestTeam(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.TeamCreateInput>,
) {
  const name = overrides?.name || `Team ${faker.company.name()} ${getUniqueId()}`;
  const slug = overrides?.slug || `team-${getUniqueId()}`;
  return prisma.team.create({
    data: {
      name,
      slug,
      ...overrides,
    },
  });
}

/**
 * Creates and persists a test Athlete record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestAthlete(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.AthleteCreateInput>,
) {
  const name = overrides?.name || faker.person.fullName();
  const document = overrides?.document || getUniqueDocument();
  const birthDate = overrides?.birthDate ? new Date(overrides.birthDate) : faker.date.birthdate();
  const email = overrides?.email || `athlete-${getUniqueId()}@example.com`;
  return prisma.athlete.create({
    data: {
      name,
      document,
      birthDate,
      email,
      ...overrides,
    },
  });
}

/**
 * Creates and persists a test Staff record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestStaff(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.StaffCreateInput>,
) {
  const name = overrides?.name || faker.person.fullName();
  const email = overrides?.email || `staff-${getUniqueId()}@example.com`;
  const passwordHash = overrides?.passwordHash || '$2b$10$dummyhashplaceholder';
  return prisma.staff.create({
    data: {
      name,
      email,
      passwordHash,
      isSuperAdmin: overrides?.isSuperAdmin !== undefined ? overrides.isSuperAdmin : false,
      ...overrides,
    },
  });
}

/**
 * Creates a test EditionDiscipline.
 *
 * @implicitBehavior If `overrides.editionId` is not provided, this function automatically creates a parent
 * CompetitionEdition. If `overrides.disciplineId` is not provided, it automatically creates a parent Discipline.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestEditionDiscipline(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.EditionDisciplineUncheckedCreateInput>,
) {
  const editionId = await getOrInitDependency(overrides?.editionId, () =>
    createTestCompetitionEdition(prisma),
  );
  const disciplineId = await getOrInitDependency(overrides?.disciplineId, () =>
    createTestDiscipline(prisma),
  );

  return prisma.editionDiscipline.create({
    data: {
      editionId,
      disciplineId,
      config: overrides?.config || null,
      ...overrides,
    },
  });
}

/**
 * Creates a test EditionRoster.
 *
 * @implicitBehavior If `overrides.editionDisciplineId` is not provided, this function automatically creates
 * a parent EditionDiscipline. If `overrides.athleteId` is not provided, it automatically creates an Athlete.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestEditionRoster(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.EditionRosterUncheckedCreateInput>,
) {
  const editionDisciplineId = await getOrInitDependency(overrides?.editionDisciplineId, () =>
    createTestEditionDiscipline(prisma),
  );
  const athleteId = await getOrInitDependency(overrides?.athleteId, () =>
    createTestAthlete(prisma),
  );

  return prisma.editionRoster.create({
    data: {
      editionDisciplineId,
      athleteId,
      teamId: overrides?.teamId || null,
      jerseyNumber:
        overrides?.jerseyNumber !== undefined
          ? overrides.jerseyNumber
          : faker.number.int({ min: 1, max: 99 }),
      status: overrides?.status || 'ACTIVE',
      ...overrides,
    },
  });
}

/**
 * Creates a test EditionStaffRole.
 *
 * @implicitBehavior If `overrides.editionId` is not provided, this function automatically creates a parent
 * CompetitionEdition. If `overrides.staffId` is not provided, it automatically creates a Staff record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestEditionStaffRole(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.EditionStaffRoleUncheckedCreateInput>,
) {
  const editionId = await getOrInitDependency(overrides?.editionId, () =>
    createTestCompetitionEdition(prisma),
  );
  const staffId = await getOrInitDependency(overrides?.staffId, () => createTestStaff(prisma));

  return prisma.editionStaffRole.create({
    data: {
      editionId,
      staffId,
      editionDisciplineId: overrides?.editionDisciplineId || null,
      role: overrides?.role || 'DISCIPLINE_MANAGER',
      ...overrides,
    },
  });
}

/**
 * Creates a test Tournament.
 *
 * @implicitBehavior If `overrides.editionDisciplineId` is not provided, this function automatically creates
 * a parent EditionDiscipline.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestTournament(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.TournamentUncheckedCreateInput>,
) {
  const editionDisciplineId = await getOrInitDependency(overrides?.editionDisciplineId, () =>
    createTestEditionDiscipline(prisma),
  );

  const name = overrides?.name || `Tournament-${getUniqueId()}`;
  return prisma.tournament.create({
    data: {
      editionDisciplineId,
      name,
      format: overrides?.format || 'SINGLE_ELIMINATION',
      status: overrides?.status || 'DRAFT',
      ...overrides,
    },
  });
}

/**
 * Creates a test TournamentEntry.
 *
 * @implicitBehavior If `overrides.tournamentId` is not provided, this function automatically creates a parent
 * Tournament. If neither `overrides.teamId` nor `overrides.athleteId` are specified, it automatically creates
 * a Team record to associate with this entry.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestTournamentEntry(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.TournamentEntryUncheckedCreateInput>,
) {
  const tournamentId = await getOrInitDependency(overrides?.tournamentId, () =>
    createTestTournament(prisma),
  );

  let teamId = overrides?.teamId;
  const athleteId = overrides?.athleteId;

  if (teamId === undefined && athleteId === undefined) {
    const team = await createTestTeam(prisma);
    teamId = team.id;
  }

  return prisma.tournamentEntry.create({
    data: {
      tournamentId,
      teamId,
      athleteId,
      seed: overrides?.seed !== undefined ? overrides.seed : null,
      ...overrides,
    },
  });
}

/**
 * Creates a test Phase.
 *
 * @implicitBehavior If `overrides.tournamentId` is not provided, this function automatically creates a parent
 * Tournament.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestPhase(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.PhaseUncheckedCreateInput>,
) {
  const tournamentId = await getOrInitDependency(overrides?.tournamentId, () =>
    createTestTournament(prisma),
  );

  const order =
    overrides?.order !== undefined
      ? overrides.order
      : (await prisma.phase.count({ where: { tournamentId } })) + 1;
  const name = overrides?.name || `Phase ${order}`;
  return prisma.phase.create({
    data: {
      tournamentId,
      order,
      name,
      type: overrides?.type || 'KNOCKOUT',
      config: overrides?.config || null,
      ...overrides,
    },
  });
}

/**
 * Creates a test Group.
 *
 * @implicitBehavior If `overrides.phaseId` is not provided, this function automatically creates a parent
 * Phase of type 'GROUP'.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestGroup(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.GroupUncheckedCreateInput>,
) {
  const phaseId = await getOrInitDependency(overrides?.phaseId, () =>
    createTestPhase(prisma, { type: 'GROUP' }),
  );

  const name = overrides?.name || `Group ${faker.string.alphanumeric(1).toUpperCase()}`;
  return prisma.group.create({
    data: {
      phaseId,
      name,
      ...overrides,
    },
  });
}

/**
 * Creates a test GroupEntry.
 *
 * @implicitBehavior If `overrides.groupId` is not provided, this function automatically creates a parent Group
 * (which in turn creates a Phase). If `overrides.entryId` is not provided, this function resolves the
 * Group's phase to get the parent Tournament, then creates a new TournamentEntry associated with that tournament.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestGroupEntry(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.GroupEntryUncheckedCreateInput>,
) {
  const groupId = await getOrInitDependency(overrides?.groupId, () => createTestGroup(prisma));

  const entryId = await getOrInitDependency(overrides?.entryId, async () => {
    const groupRecord = await prisma.group.findUnique({
      where: { id: groupId },
      include: { phase: true },
    });
    return createTestTournamentEntry(prisma, {
      tournamentId: groupRecord?.phase.tournamentId,
    });
  });

  return prisma.groupEntry.create({
    data: {
      groupId,
      entryId,
      ...overrides,
    },
  });
}

/**
 * Creates a test Match.
 *
 * @implicitBehavior If `overrides.phaseId` is not provided, this function automatically creates a parent Phase.
 * If `overrides.entryAId` is not provided, it automatically creates a TournamentEntry (and parent entities)
 * associated with the same tournament as the Match's Phase. Similarly, if `overrides.entryBId` is not provided,
 * it automatically creates another TournamentEntry for the same tournament.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestMatch(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.MatchUncheckedCreateInput>,
) {
  const phaseId = await getOrInitDependency(overrides?.phaseId, () => createTestPhase(prisma));

  const phaseRecord = await prisma.phase.findUnique({
    where: { id: phaseId },
  });
  const tournamentId = phaseRecord?.tournamentId;

  const entryAId = await getOrInitDependency(overrides?.entryAId, () =>
    createTestTournamentEntry(prisma, { tournamentId }),
  );
  const entryBId = await getOrInitDependency(overrides?.entryBId, () =>
    createTestTournamentEntry(prisma, { tournamentId }),
  );

  return prisma.match.create({
    data: {
      phaseId,
      groupId: overrides?.groupId || null,
      round: overrides?.round !== undefined ? overrides.round : null,
      bracketSlot: overrides?.bracketSlot !== undefined ? overrides.bracketSlot : null,
      entryAId,
      entryBId,
      winnerEntryId: overrides?.winnerEntryId || null,
      scoreA: overrides?.scoreA !== undefined ? overrides.scoreA : 0,
      scoreB: overrides?.scoreB !== undefined ? overrides.scoreB : 0,
      lastEventSequence:
        overrides?.lastEventSequence !== undefined ? overrides.lastEventSequence : 0,
      status: overrides?.status || 'SCHEDULED',
      scheduledAt: overrides?.scheduledAt ? new Date(overrides.scheduledAt) : null,
      venue: overrides?.venue || null,
      ...overrides,
    },
  });
}

/**
 * Creates a test MatchEvent.
 *
 * @implicitBehavior If `overrides.matchId` is not provided, this function automatically creates a parent Match.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestMatchEvent(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.MatchEventUncheckedCreateInput>,
) {
  const matchId = await getOrInitDependency(overrides?.matchId, () => createTestMatch(prisma));

  const sequence =
    overrides?.sequence !== undefined
      ? overrides.sequence
      : (await prisma.matchEvent.count({ where: { matchId } })) + 1;
  return prisma.matchEvent.create({
    data: {
      matchId,
      entryId: overrides?.entryId || null,
      athleteId: overrides?.athleteId || null,
      type: overrides?.type || 'OTHER',
      metadata: overrides?.metadata || null,
      sequence,
      occurredAt: overrides?.occurredAt ? new Date(overrides.occurredAt) : new Date(),
      ...overrides,
    },
  });
}

/**
 * Creates a test PhaseStanding.
 *
 * @implicitBehavior If `overrides.phaseId` is not provided, this function automatically creates a parent Phase.
 * If `overrides.entryId` is not provided, it automatically creates a TournamentEntry associated with the
 * parent tournament of that Phase.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestPhaseStanding(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.PhaseStandingUncheckedCreateInput>,
) {
  const phaseId = await getOrInitDependency(overrides?.phaseId, () => createTestPhase(prisma));

  const entryId = await getOrInitDependency(overrides?.entryId, async () => {
    const phaseRecord = await prisma.phase.findUnique({
      where: { id: phaseId },
    });
    return createTestTournamentEntry(prisma, {
      tournamentId: phaseRecord?.tournamentId,
    });
  });

  return prisma.phaseStanding.create({
    data: {
      phaseId,
      entryId,
      played: overrides?.played !== undefined ? overrides.played : 0,
      won: overrides?.won !== undefined ? overrides.won : 0,
      drawn: overrides?.drawn !== undefined ? overrides.drawn : 0,
      lost: overrides?.lost !== undefined ? overrides.lost : 0,
      scoreFor: overrides?.scoreFor !== undefined ? overrides.scoreFor : 0,
      scoreAgainst: overrides?.scoreAgainst !== undefined ? overrides.scoreAgainst : 0,
      points: overrides?.points !== undefined ? overrides.points : 0,
      rank: overrides?.rank !== undefined ? overrides.rank : null,
      ...overrides,
    },
  });
}

/**
 * Creates and persists a test AuditLog record.
 *
 * @param prisma The PrismaClient instance.
 * @param overrides Optional field values to override defaults.
 */
export async function createTestAuditLog(
  prisma: PrismaClient,
  overrides?: Partial<Prisma.AuditLogUncheckedCreateInput>,
) {
  return prisma.auditLog.create({
    data: {
      editionId: overrides?.editionId || null,
      staffId: overrides?.staffId || null,
      action: overrides?.action || 'TEST_ACTION',
      entityType: overrides?.entityType || 'TestEntity',
      entityId: overrides?.entityId || 'test-id',
      beforeData: overrides?.beforeData || null,
      afterData: overrides?.afterData || null,
      ...overrides,
    },
  });
}
