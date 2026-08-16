import {
  EditionStaffRoleType,
  EditionStatus,
  OverallPosition,
  PhaseType,
  Prisma,
  PrismaClient,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function assertDemoSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed de demonstração é proibido quando NODE_ENV=production.');
  }

  if (process.env.SEED_DEMO_DATA?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'Defina SEED_DEMO_DATA=true para confirmar explicitamente a criação dos dados de demonstração.',
    );
  }
}

function seedPassword(variable: string, localFallback: string): string {
  return process.env[variable]?.trim() || localFallback;
}

function bcryptRounds(): number {
  const configured = Number(process.env.SEED_BCRYPT_ROUNDS ?? 10);
  if (!Number.isInteger(configured) || configured < 8 || configured > 14) {
    throw new Error('SEED_BCRYPT_ROUNDS deve ser um inteiro entre 8 e 14.');
  }
  return configured;
}

type DemoStaffSpec = {
  name: string;
  email: string;
  password: string;
  isSuperAdmin: boolean;
};

async function ensureDemoStaff(
  tx: Prisma.TransactionClient,
  spec: DemoStaffSpec,
  rounds: number,
): Promise<{ id: string }> {
  const existing = await tx.staff.findUnique({ where: { email: spec.email } });

  if (existing) {
    const passwordMatches = await bcrypt.compare(spec.password, existing.passwordHash);
    if (
      existing.name !== spec.name ||
      existing.isSuperAdmin !== spec.isSuperAdmin ||
      !passwordMatches
    ) {
      throw new Error(
        `A conta ${spec.email} já existe e não corresponde à conta de demonstração. ` +
          'O seed não altera nome, senha ou privilégios de contas existentes.',
      );
    }
    return { id: existing.id };
  }

  return tx.staff.create({
    data: {
      name: spec.name,
      email: spec.email,
      passwordHash: await bcrypt.hash(spec.password, rounds),
      isSuperAdmin: spec.isSuperAdmin,
    },
    select: { id: true },
  });
}

async function ensureActiveRole(
  tx: Prisma.TransactionClient,
  input: {
    editionId: string;
    staffId: string;
    role: EditionStaffRoleType;
    editionDisciplineId: string | null;
  },
): Promise<void> {
  const logicalRole = {
    editionId: input.editionId,
    staffId: input.staffId,
    role: input.role,
    editionDisciplineId: input.editionDisciplineId,
  } as const;

  const active = await tx.editionStaffRole.findFirst({
    where: { ...logicalRole, revokedAt: null },
  });
  if (active) return;

  const revoked = await tx.editionStaffRole.findFirst({
    where: { ...logicalRole, revokedAt: { not: null } },
    orderBy: { revokedAt: 'desc' },
  });
  if (revoked) {
    throw new Error(
      `O papel ${input.role} do usuário ${input.staffId} foi revogado. ` +
        'O seed não reativa papéis revogados; faça uma concessão auditável pela aplicação.',
    );
  }

  await tx.editionStaffRole.create({ data: logicalRole });
}

async function main(): Promise<void> {
  assertDemoSeedAllowed();

  const rounds = bcryptRounds();
  const demoPasswords = {
    superAdmin: seedPassword('SEED_SUPER_ADMIN_PASSWORD', 'super2026'),
    editionAdmin: seedPassword('SEED_EDITION_ADMIN_PASSWORD', 'intereng2026'),
    disciplineManager: seedPassword('SEED_DISCIPLINE_MANAGER_PASSWORD', 'futsal2026'),
  };

  await prisma.$transaction(async (tx) => {
    const existingCompetition = await tx.competition.findUnique({
      where: { slug: 'intereng' },
    });
    const activeCompetitionConflict = await tx.competition.findFirst({
      where: {
        isActive: true,
        ...(existingCompetition ? { id: { not: existingCompetition.id } } : {}),
      },
      select: { id: true, name: true },
    });
    if (activeCompetitionConflict) {
      throw new Error(
        `A competição "${activeCompetitionConflict.name}" (${activeCompetitionConflict.id}) já está ativa. ` +
          'O seed não troca o contexto ativo automaticamente.',
      );
    }

    const competition = await tx.competition.upsert({
      where: { slug: 'intereng' },
      create: { id: 'jogos-engenharia', name: 'InterEng', slug: 'intereng' },
      update: {},
      select: { id: true, isActive: true },
    });
    if (!competition.isActive) {
      await tx.competition.update({
        where: { id: competition.id },
        data: { isActive: true },
      });
    }

    const existingEdition = await tx.competitionEdition.findUnique({
      where: {
        competitionId_year: { competitionId: competition.id, year: 2026 },
      },
    });
    const activeEditionConflict = await tx.competitionEdition.findFirst({
      where: {
        isActive: true,
        ...(existingEdition ? { id: { not: existingEdition.id } } : {}),
      },
      select: { id: true, name: true },
    });
    if (activeEditionConflict) {
      throw new Error(
        `A edição "${activeEditionConflict.name}" (${activeEditionConflict.id}) já está ativa. ` +
          'O seed não troca o contexto ativo automaticamente.',
      );
    }

    const edition = await tx.competitionEdition.upsert({
      where: {
        competitionId_year: { competitionId: competition.id, year: 2026 },
      },
      create: {
        id: 'intereng-2026',
        competitionId: competition.id,
        year: 2026,
        name: '2026',
        startDate: new Date('2026-10-12T00:00:00.000Z'),
        endDate: new Date('2026-10-19T23:59:59.999Z'),
        status: EditionStatus.ONGOING,
      },
      update: {},
      select: { id: true, isActive: true },
    });
    if (!edition.isActive) {
      await tx.competitionEdition.update({
        where: { id: edition.id },
        data: { isActive: true },
      });
    }

    const disciplineSpecs = [
      { slug: 'futsal', name: 'Futsal', isIndividual: false },
      { slug: 'volei', name: 'Vôlei', isIndividual: false },
      { slug: 'handebol', name: 'Handebol', isIndividual: false },
      { slug: 'xadrez', name: 'Xadrez', isIndividual: true },
    ] as const;
    const editionDisciplineBySlug = new Map<string, string>();

    for (const spec of disciplineSpecs) {
      const discipline = await tx.discipline.upsert({
        where: { slug: spec.slug },
        create: {
          name: spec.name,
          slug: spec.slug,
          isIndividual: spec.isIndividual,
        },
        update: {},
        select: { id: true },
      });
      const editionDiscipline = await tx.editionDiscipline.upsert({
        where: {
          editionId_disciplineId: {
            editionId: edition.id,
            disciplineId: discipline.id,
          },
        },
        create: {
          editionId: edition.id,
          disciplineId: discipline.id,
          config: {
            enabled: true,
            mode: spec.isIndividual ? 'Individual' : 'Coletiva',
          },
        },
        update: {},
        select: { id: true },
      });
      editionDisciplineBySlug.set(spec.slug, editionDiscipline.id);
    }

    const teamSpecs = [
      { slug: 'alcateia', name: 'Alcateia', initials: 'ALC', logoKey: 'teams/alcateia.webp' },
      {
        slug: 'cangaceiros',
        name: 'Cangaceiros',
        initials: 'CAN',
        logoKey: 'teams/cangaceiros.webp',
      },
      { slug: 'caotica', name: 'Caótica', initials: 'CAO', logoKey: 'teams/caotica.webp' },
      { slug: 'energizada', name: 'Energizada', initials: 'ENE', logoKey: 'teams/energizada.webp' },
    ] as const;
    const teamBySlug = new Map<string, string>();

    for (const spec of teamSpecs) {
      const team = await tx.team.upsert({
        where: { slug: spec.slug },
        create: {
          name: spec.name,
          slug: spec.slug,
          initials: spec.initials,
          logoKey: spec.logoKey,
        },
        update: {},
        select: { id: true },
      });
      teamBySlug.set(spec.slug, team.id);
      await tx.editionTeam.upsert({
        where: { editionId_teamId: { editionId: edition.id, teamId: team.id } },
        create: { editionId: edition.id, teamId: team.id },
        update: {},
      });
    }

    const athleteSpecs = [
      { clientId: 'ana-lima', name: 'Ana Lima', team: 'alcateia', modalities: ['futsal', 'volei'] },
      { clientId: 'marina-souza', name: 'Marina Souza', team: 'alcateia', modalities: ['volei'] },
      {
        clientId: 'rafael-santos',
        name: 'Rafael Santos',
        team: 'cangaceiros',
        modalities: ['futsal'],
      },
      { clientId: 'joao-pedro', name: 'João Pedro', team: 'caotica', modalities: [] },
    ] as const;

    for (const spec of athleteSpecs) {
      const teamId = teamBySlug.get(spec.team);
      if (!teamId) throw new Error(`Equipe de demonstração não encontrada: ${spec.team}.`);

      const athlete = await tx.athlete.upsert({
        where: { id: spec.clientId },
        create: { id: spec.clientId, name: spec.name },
        update: {},
        select: { id: true },
      });
      await tx.editionAthlete.upsert({
        where: {
          editionId_athleteId: { editionId: edition.id, athleteId: athlete.id },
        },
        create: {
          editionId: edition.id,
          athleteId: athlete.id,
          teamId,
        },
        update: {},
      });

      for (const modality of spec.modalities) {
        const editionDisciplineId = editionDisciplineBySlug.get(modality);
        if (!editionDisciplineId) {
          throw new Error(`Modalidade de demonstração não encontrada: ${modality}.`);
        }
        await tx.editionRoster.upsert({
          where: {
            editionDisciplineId_athleteId: {
              editionDisciplineId,
              athleteId: athlete.id,
            },
          },
          create: { editionDisciplineId, athleteId: athlete.id, teamId },
          update: {},
        });
      }
    }

    await ensureDemoStaff(
      tx,
      {
        name: 'Super Admin',
        email: 'super@intereng.com',
        password: demoPasswords.superAdmin,
        isSuperAdmin: true,
      },
      rounds,
    );
    const editionAdmin = await ensureDemoStaff(
      tx,
      {
        name: 'Ana Coordenadora',
        email: 'ana@ufpe.br',
        password: demoPasswords.editionAdmin,
        isSuperAdmin: false,
      },
      rounds,
    );
    const disciplineManager = await ensureDemoStaff(
      tx,
      {
        name: 'Bruno Martins',
        email: 'bruno@ufpe.br',
        password: demoPasswords.disciplineManager,
        isSuperAdmin: false,
      },
      rounds,
    );
    await ensureActiveRole(tx, {
      editionId: edition.id,
      staffId: editionAdmin.id,
      role: EditionStaffRoleType.EDITION_ADMIN,
      editionDisciplineId: null,
    });

    const futsalEditionDisciplineId = editionDisciplineBySlug.get('futsal');
    if (!futsalEditionDisciplineId) {
      throw new Error('Modalidade Futsal não foi vinculada à edição de demonstração.');
    }
    await ensureActiveRole(tx, {
      editionId: edition.id,
      staffId: disciplineManager.id,
      role: EditionStaffRoleType.DISCIPLINE_MANAGER,
      editionDisciplineId: futsalEditionDisciplineId,
    });

    const metricSpecs = [
      {
        clientId: 'metric-champion',
        name: 'Campeão da modalidade',
        defaultPoints: 10,
        position: OverallPosition.CHAMPION,
      },
      {
        clientId: 'metric-runner-up',
        name: 'Vice-campeão',
        defaultPoints: 7,
        position: OverallPosition.RUNNER_UP,
      },
      {
        clientId: 'metric-third',
        name: 'Terceiro lugar',
        defaultPoints: 5,
        position: OverallPosition.THIRD,
      },
      {
        clientId: 'metric-participation',
        name: 'Participação',
        defaultPoints: 1,
        position: OverallPosition.PARTICIPATION,
      },
    ] as const;

    for (const spec of metricSpecs) {
      await tx.overallMetric.upsert({
        where: {
          editionId_clientId: { editionId: edition.id, clientId: spec.clientId },
        },
        create: { editionId: edition.id, ...spec },
        update: {},
      });
    }

    const alcateiaTeamId = teamBySlug.get('alcateia');
    const cangaceirosTeamId = teamBySlug.get('cangaceiros');
    if (!alcateiaTeamId || !cangaceirosTeamId) {
      throw new Error('Equipes participantes do torneio de demonstração não foram criadas.');
    }

    const tournament = await tx.tournament.upsert({
      where: {
        editionDisciplineId_name: {
          editionDisciplineId: futsalEditionDisciplineId,
          name: 'Futsal Masculino',
        },
      },
      create: {
        editionDisciplineId: futsalEditionDisciplineId,
        name: 'Futsal Masculino',
        format: TournamentFormat.GROUP_KNOCKOUT,
        status: TournamentStatus.ONGOING,
        config: {
          participants: [alcateiaTeamId, cangaceirosTeamId],
          advancement: {
            perGroup: 2,
            bestThirds: 0,
            crossing: 'padrao',
            thirdPlaceMatch: true,
          },
          generated: false,
        },
      },
      update: {},
      select: { id: true },
    });

    const [phaseAtDemoOrder, phaseUsingGroupsClientId] = await Promise.all([
      tx.phase.findUnique({
        where: { tournamentId_order: { tournamentId: tournament.id, order: 1 } },
        select: { id: true },
      }),
      tx.phase.findUnique({
        where: {
          tournamentId_clientId: { tournamentId: tournament.id, clientId: 'groups' },
        },
        select: { id: true, order: true },
      }),
    ]);
    if (
      phaseUsingGroupsClientId &&
      (!phaseAtDemoOrder || phaseUsingGroupsClientId.id !== phaseAtDemoOrder.id)
    ) {
      throw new Error(
        `O clientId "groups" já pertence à fase de ordem ${phaseUsingGroupsClientId.order} ` +
          'no torneio de demonstração; o seed não escolhe uma fase arbitrariamente.',
      );
    }

    const phase = await tx.phase.upsert({
      where: { tournamentId_order: { tournamentId: tournament.id, order: 1 } },
      create: {
        tournamentId: tournament.id,
        clientId: 'groups',
        order: 1,
        name: 'Fase de grupos',
        type: PhaseType.GROUP,
        config: { qualifiers: 2 },
      },
      update: { clientId: 'groups' },
      select: { id: true },
    });

    const entryIds = new Map<string, string>();
    for (const [index, teamSlug] of ['alcateia', 'cangaceiros'].entries()) {
      const teamId = teamBySlug.get(teamSlug);
      if (!teamId) throw new Error(`Equipe de demonstração não encontrada: ${teamSlug}.`);
      const entry = await tx.tournamentEntry.upsert({
        where: { tournamentId_teamId: { tournamentId: tournament.id, teamId } },
        create: { tournamentId: tournament.id, teamId, seed: index + 1 },
        update: {},
        select: { id: true },
      });
      entryIds.set(teamSlug, entry.id);
    }

    const entryAId = entryIds.get('alcateia');
    const entryBId = entryIds.get('cangaceiros');
    if (!entryAId || !entryBId) {
      throw new Error('Participantes da partida de demonstração não foram criados.');
    }

    const existingDemoMatch = await tx.match.findUnique({
      where: { id: 'semifinal-1' },
      select: { phaseId: true, entryAId: true, entryBId: true },
    });
    if (
      existingDemoMatch &&
      (existingDemoMatch.phaseId !== phase.id ||
        existingDemoMatch.entryAId !== entryAId ||
        existingDemoMatch.entryBId !== entryBId)
    ) {
      throw new Error(
        'A partida semifinal-1 já existe fora do torneio de demonstração. O seed não a redefine.',
      );
    }

    await tx.match.upsert({
      where: { id: 'semifinal-1' },
      create: {
        id: 'semifinal-1',
        phaseId: phase.id,
        entryAId,
        entryBId,
        scoreA: 2,
        scoreB: 1,
        status: 'LIVE',
        scheduledAt: new Date('2026-10-12T20:00:00.000Z'),
        venue: 'Ginásio CIn',
        startedAt: new Date('2026-10-12T20:00:00.000Z'),
        startedById: editionAdmin.id,
        operatorId: disciplineManager.id,
        operatorName: 'Bruno Martins',
        operatorHeartbeat: new Date('2026-10-12T20:30:00.000Z'),
        paused: false,
        clockSeconds: 1800,
        periodScoreA: 2,
        periodScoreB: 1,
      },
      update: {},
    });
  });

  console.log('Seed concluído: dados de demonstração InterEng 2026 disponíveis.');
}

main()
  .catch((error: unknown) => {
    console.error('Falha ao executar o seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
