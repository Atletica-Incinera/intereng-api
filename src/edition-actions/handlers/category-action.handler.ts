import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, PhaseType, Prisma, TournamentStatus } from '@prisma/client';
import {
  actionArray,
  actionBoolean,
  actionDate,
  actionEnum,
  actionId,
  actionNumber,
  actionObject,
  actionString,
  actionTime,
  requireActionReason,
  scheduledAt,
  toInputJson,
} from '../action-validation';
import {
  inferTournamentFormat,
  mapPhaseType,
  mapTournamentStatus,
  PHASE_FORMAT_VALUES,
  TOURNAMENT_STATUS_VALUES,
} from '../action-mappers';
import { EditionActionAuditDto } from '../dto/edition-action.dto';
import { ActionMutationResult, EditionActionContext } from '../edition-actions.types';

const TOURNAMENT_FIELDS = [
  'status',
  'participants',
  'seeds',
  'phases',
  'assignments',
  'generated',
  'editionId',
  'created',
  'name',
  'discipline',
  'format',
  'tone',
  'advancement',
  'byes',
] as const;
const MATCH_FIELDS = [
  'date',
  'time',
  'venue',
  'status',
  'reason',
  'scoreA',
  'scoreB',
  'created',
  'editionId',
  'discipline',
  'entryA',
  'entryB',
  'logoA',
  'logoB',
  'phase',
  'tournamentId',
  'rules',
  'currentPeriod',
  'clockSeconds',
  'runningSince',
  'paused',
  'events',
  'operatorId',
  'operatorName',
  'operatorHeartbeat',
  'periodScoreA',
  'periodScoreB',
  'periodResults',
  'startedAt',
  'startedBy',
  'startNote',
  'tiebreak',
  'corrections',
  'walkoverWinner',
] as const;

interface ParsedPhase {
  clientId: string;
  name: string;
  type: PhaseType;
  format: (typeof PHASE_FORMAT_VALUES)[number];
  groups: string[];
  qualifiers: number;
}

interface ParsedTournamentSetup {
  status: TournamentStatus;
  participants: string[];
  seeds: Record<string, number>;
  phases: ParsedPhase[];
  assignments: Record<string, string>;
  generated: boolean;
  editionId: string;
  name: string;
  discipline: string;
  advancement?: Record<string, unknown>;
  byes?: Record<string, string>;
}

@Injectable()
export class CategoryActionHandler {
  async create(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'category']);
    const id = actionId(payload, 'id', 'O ID da categoria');
    const setup = this.parseSetup(
      actionObject(payload.category, 'A categoria', TOURNAMENT_FIELDS),
      context,
    );
    if (await context.transaction.tournament.findUnique({ where: { id }, select: { id: true } })) {
      throw new ConflictException('Já existe uma categoria com o ID informado.');
    }
    const discipline = await this.disciplineOrThrow(context, setup.discipline);
    await context.transaction.tournament.create({
      data: {
        id,
        editionDisciplineId: discipline.id,
        name: setup.name,
        status: setup.status,
        format: inferTournamentFormat(setup.phases),
        config: this.tournamentConfig(setup),
      },
    });
    await this.reconcileSetup(context.transaction, context.edition.id, id, discipline, setup);
    return { entityType: 'Tournament', entityId: id, editionDisciplineId: discipline.id };
  }

  async update(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'setup']);
    const id = actionId(payload, 'id', 'O ID da categoria');
    const setup = this.parseSetup(
      actionObject(payload.setup, 'A configuração da categoria', TOURNAMENT_FIELDS),
      context,
    );
    const tournament = await this.tournamentOrThrow(context, id);
    const discipline = await this.disciplineOrThrow(context, setup.discipline);
    if (discipline.id !== tournament.editionDisciplineId) {
      throw new ConflictException('A modalidade da categoria não pode ser alterada.');
    }
    await this.assertOperatedStructureUnchanged(context.transaction, id, setup);

    await context.transaction.tournament.update({
      where: { id },
      data: {
        name: setup.name,
        status: setup.status,
        format: inferTournamentFormat(setup.phases),
        config: this.tournamentConfig(setup, { existing: tournament.config }),
      },
    });
    await this.reconcileSetup(context.transaction, context.edition.id, id, discipline, setup);
    return { entityType: 'Tournament', entityId: id, editionDisciplineId: discipline.id };
  }

  async generateMatches(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'setup', 'matches']);
    const id = actionId(payload, 'id', 'O ID da categoria');
    const setup = this.parseSetup(
      actionObject(payload.setup, 'A configuração da categoria', TOURNAMENT_FIELDS),
      context,
    );
    const matches = actionObject(payload.matches, 'Os confrontos');
    if (Object.keys(matches).length > 500) {
      throw new ConflictException('A geração deve possuir no máximo 500 confrontos.');
    }
    const tournament = await this.tournamentOrThrow(context, id);
    const discipline = await this.disciplineOrThrow(context, setup.discipline);
    if (discipline.id !== tournament.editionDisciplineId) {
      throw new ConflictException('A modalidade da categoria não pode ser alterada.');
    }
    await this.assertOperatedStructureUnchanged(context.transaction, id, setup);

    const generatedExisting = await context.transaction.match.findMany({
      where: {
        phase: { tournamentId: id },
        OR: [{ id: { startsWith: `${id}-generated-` } }, { id: { startsWith: `${id}-advanced` } }],
      },
      select: { id: true, status: true },
    });
    if (generatedExisting.some((match) => match.status !== MatchStatus.SCHEDULED)) {
      requireActionReason(audit, 'A regeração de confrontos operados');
    }
    await context.transaction.match.deleteMany({
      where: { id: { in: generatedExisting.map((match) => match.id) } },
    });

    await context.transaction.tournament.update({
      where: { id },
      data: {
        name: setup.name,
        status: setup.status,
        format: inferTournamentFormat(setup.phases),
        config: this.tournamentConfig(setup, { resetProgression: true }),
      },
    });
    await this.reconcileSetup(context.transaction, context.edition.id, id, discipline, setup);

    for (const [matchId, rawMatch] of Object.entries(matches)) {
      const idRecord = { id: matchId };
      actionId(idRecord, 'id', 'O ID do confronto');
      const match = actionObject(rawMatch, `O confronto ${matchId}`, MATCH_FIELDS);
      await this.createMatch(
        context.transaction,
        context.edition.id,
        id,
        discipline,
        matchId,
        match,
      );
    }
    return { entityType: 'Tournament', entityId: id, editionDisciplineId: discipline.id };
  }

  private async assertOperatedStructureUnchanged(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    setup: ParsedTournamentSetup,
  ): Promise<void> {
    const operatedMatches = await transaction.match.count({
      where: {
        phase: { tournamentId },
        status: { in: [MatchStatus.LIVE, MatchStatus.FINISHED, MatchStatus.WALKOVER] },
      },
    });
    if (operatedMatches === 0) return;

    const currentStructure = await this.structureSignature(transaction, tournamentId);
    const requestedStructure = this.requestedStructureSignature(setup);
    if (currentStructure !== requestedStructure) {
      throw new ConflictException(
        'Participantes, seeds, formato, fases, grupos e distribuições não podem ser alterados depois que a categoria possui partidas operadas.',
      );
    }
  }

  private parseSetup(
    setup: Record<string, unknown>,
    context: EditionActionContext,
  ): ParsedTournamentSetup {
    const editionId = actionId(setup, 'editionId', 'O ID da edição');
    if (editionId !== context.edition.id) {
      throw new ConflictException('A categoria deve pertencer à edição da rota.');
    }
    const name = actionString(setup, 'name', 'O nome da categoria', { min: 3, max: 160 });
    const discipline = actionString(setup, 'discipline', 'A modalidade da categoria', {
      min: 2,
      max: 100,
    });
    const status = mapTournamentStatus(
      actionEnum(setup, 'status', 'O status da categoria', TOURNAMENT_STATUS_VALUES),
    );
    const generated = actionBoolean(setup, 'generated', 'O estado de geração da categoria');
    const participants = actionArray(setup.participants, 'Os participantes', 200).map(
      (value, index) => {
        if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 180) {
          throw new ConflictException(`O participante na posição ${index + 1} é inválido.`);
        }
        return value.trim();
      },
    );
    if (new Set(participants).size !== participants.length) {
      throw new ConflictException('A categoria possui participantes repetidos.');
    }

    const seedRecord = actionObject(setup.seeds, 'Os seeds');
    const seeds: Record<string, number> = {};
    for (const [participant, value] of Object.entries(seedRecord)) {
      if (!participants.includes(participant)) {
        throw new ConflictException(`O seed de "${participant}" não pertence aos participantes.`);
      }
      seeds[participant] = actionNumber({ value }, 'value', `O seed de ${participant}`, {
        min: 1,
        max: 10_000,
      });
    }

    const phases = actionArray(setup.phases, 'As fases', 30).map((rawPhase, index) => {
      const phase = actionObject(rawPhase, `A fase ${index + 1}`, [
        'id',
        'name',
        'format',
        'groups',
        'qualifiers',
        // O snapshot devolve a classificação calculada dentro de cada fase, e o
        // cliente reenvia a fase inteira ao alterar a categoria. É campo de
        // leitura: aceito para não recusar o que o próprio servidor emitiu, e
        // ignorado aqui porque quem o produz é o recálculo.
        'standings',
      ]);
      const clientId = actionId(phase, 'id', `O ID da fase ${index + 1}`);
      const phaseName = actionString(phase, 'name', `O nome da fase ${index + 1}`, {
        min: 2,
        max: 160,
      });
      const format = actionEnum(
        phase,
        'format',
        `O formato da fase ${index + 1}`,
        PHASE_FORMAT_VALUES,
      );
      const groups = actionArray(phase.groups, `Os grupos da fase ${index + 1}`, 100).map(
        (value, groupIndex) => {
          if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) {
            throw new ConflictException(
              `O grupo ${groupIndex + 1} da fase ${index + 1} é inválido.`,
            );
          }
          return value.trim();
        },
      );
      if (new Set(groups).size !== groups.length) {
        throw new ConflictException(`A fase ${phaseName} possui grupos repetidos.`);
      }
      const qualifiers = actionNumber(
        phase,
        'qualifiers',
        `A quantidade de classificados da fase ${index + 1}`,
        { min: 1, max: 500 },
      );
      return {
        clientId,
        name: phaseName,
        type: mapPhaseType(format),
        format,
        groups,
        qualifiers,
      };
    });
    if (!phases.length) throw new ConflictException('A categoria deve possuir ao menos uma fase.');
    if (new Set(phases.map((phase) => phase.clientId)).size !== phases.length) {
      throw new ConflictException('A categoria possui IDs de fase repetidos.');
    }

    const assignmentRecord = actionObject(setup.assignments, 'As distribuições de grupo');
    const groupNames = new Set(phases.flatMap((phase) => phase.groups));
    const assignments: Record<string, string> = {};
    for (const [participant, value] of Object.entries(assignmentRecord)) {
      if (
        !participants.includes(participant) ||
        typeof value !== 'string' ||
        !groupNames.has(value)
      ) {
        throw new ConflictException(`A distribuição de grupo de "${participant}" é inválida.`);
      }
      assignments[participant] = value;
    }

    const advancement =
      setup.advancement === undefined
        ? undefined
        : actionObject(setup.advancement, 'O critério de avanço', [
            'perGroup',
            'bestThirds',
            'crossing',
            'thirdPlaceMatch',
          ]);
    if (advancement) {
      actionNumber(advancement, 'perGroup', 'Os classificados por grupo', { min: 1, max: 500 });
      actionNumber(advancement, 'bestThirds', 'Os melhores terceiros', { min: 0, max: 500 });
      actionEnum(advancement, 'crossing', 'O cruzamento', ['padrao', 'sequencial'] as const);
      actionBoolean(advancement, 'thirdPlaceMatch', 'A disputa de terceiro lugar');
    }
    const byes =
      setup.byes === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(actionObject(setup.byes, 'As passagens automáticas')).map(
              ([slot, value]) => {
                if (typeof value !== 'string' || !participants.includes(value)) {
                  throw new ConflictException(
                    `A passagem automática da posição ${slot} é inválida.`,
                  );
                }
                return [slot, value];
              },
            ),
          );
    return {
      status,
      participants,
      seeds,
      phases,
      assignments,
      generated,
      editionId,
      name,
      discipline,
      advancement,
      byes,
    };
  }

  private async reconcileSetup(
    tx: Prisma.TransactionClient,
    editionId: string,
    tournamentId: string,
    discipline: { id: string; isIndividual: boolean },
    setup: ParsedTournamentSetup,
  ): Promise<void> {
    const entriesByName = await this.reconcileEntries(
      tx,
      editionId,
      tournamentId,
      discipline,
      setup,
    );
    const existingPhases = await tx.phase.findMany({
      where: { tournamentId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { id: true, clientId: true },
    });
    for (const [index, phase] of existingPhases.entries()) {
      await tx.phase.update({ where: { id: phase.id }, data: { order: 10_000 + index } });
    }

    const retainedPhaseIds: string[] = [];
    const groupsByName = new Map<string, string>();
    for (const [index, phase] of setup.phases.entries()) {
      const stored = await tx.phase.upsert({
        where: {
          tournamentId_clientId: { tournamentId, clientId: phase.clientId },
        },
        create: {
          tournamentId,
          clientId: phase.clientId,
          order: index + 1,
          name: phase.name,
          type: phase.type,
          config: toInputJson({ qualifiers: phase.qualifiers }, 'A configuração da fase'),
        },
        update: {
          order: index + 1,
          name: phase.name,
          type: phase.type,
          config: toInputJson({ qualifiers: phase.qualifiers }, 'A configuração da fase'),
        },
        select: { id: true },
      });
      retainedPhaseIds.push(stored.id);
      const existingGroups = await tx.group.findMany({
        where: { phaseId: stored.id },
        select: { id: true, name: true },
      });
      for (const groupName of phase.groups) {
        const existing = existingGroups.find((group) => group.name === groupName);
        const group = existing
          ? existing
          : await tx.group.create({
              data: { phaseId: stored.id, name: groupName },
              select: { id: true, name: true },
            });
        groupsByName.set(group.name, group.id);
      }
      await tx.group.deleteMany({
        where: { phaseId: stored.id, name: { notIn: phase.groups } },
      });
    }
    await tx.phase.deleteMany({
      where: { tournamentId, id: { notIn: retainedPhaseIds } },
    });

    await tx.groupEntry.deleteMany({
      where: { group: { phase: { tournamentId } } },
    });
    for (const [participant, groupName] of Object.entries(setup.assignments)) {
      const groupId = groupsByName.get(groupName);
      const entryId = entriesByName.get(participant);
      if (!groupId || !entryId) continue;
      await tx.groupEntry.create({ data: { groupId, entryId } });
    }
  }

  private async reconcileEntries(
    tx: Prisma.TransactionClient,
    editionId: string,
    tournamentId: string,
    discipline: { id: string; isIndividual: boolean },
    setup: ParsedTournamentSetup,
  ): Promise<Map<string, string>> {
    const [teams, athletes] = await Promise.all([
      tx.editionTeam.findMany({
        where: { editionId, team: { name: { in: setup.participants } } },
        select: { teamId: true, team: { select: { name: true } } },
      }),
      tx.editionAthlete.findMany({
        where: {
          editionId,
          removed: false,
          athlete: { name: { in: setup.participants } },
          ...(discipline.isIndividual
            ? {
                athlete: {
                  name: { in: setup.participants },
                  rosters: { some: { editionDisciplineId: discipline.id } },
                },
              }
            : {}),
        },
        select: { athleteId: true, athlete: { select: { name: true } } },
      }),
    ]);
    const teamByName = new Map(teams.map((item) => [item.team.name, item.teamId]));
    const athleteByName = new Map(athletes.map((item) => [item.athlete.name, item.athleteId]));
    const entriesByName = new Map<string, string>();
    const retainedEntryIds: string[] = [];

    for (const participant of setup.participants) {
      const teamId = discipline.isIndividual ? undefined : teamByName.get(participant);
      const athleteId = discipline.isIndividual ? athleteByName.get(participant) : undefined;
      if (!teamId && !athleteId) {
        throw new NotFoundException(
          `O participante "${participant}" não foi encontrado no elenco da edição.`,
        );
      }
      const entry = teamId
        ? await tx.tournamentEntry.upsert({
            where: { tournamentId_teamId: { tournamentId, teamId } },
            create: { tournamentId, teamId, seed: setup.seeds[participant] },
            update: { seed: setup.seeds[participant] },
            select: { id: true },
          })
        : await tx.tournamentEntry.upsert({
            where: { tournamentId_athleteId: { tournamentId, athleteId: athleteId! } },
            create: { tournamentId, athleteId, seed: setup.seeds[participant] },
            update: { seed: setup.seeds[participant] },
            select: { id: true },
          });
      retainedEntryIds.push(entry.id);
      entriesByName.set(participant, entry.id);
    }
    await tx.tournamentEntry.deleteMany({
      where: { tournamentId, id: { notIn: retainedEntryIds } },
    });
    return entriesByName;
  }

  private async createMatch(
    tx: Prisma.TransactionClient,
    editionId: string,
    tournamentId: string,
    discipline: { id: string; name: string },
    id: string,
    match: Record<string, unknown>,
  ): Promise<void> {
    const declaredTournamentId = actionId(match, 'tournamentId', 'O ID da categoria do confronto');
    const declaredEditionId = actionId(match, 'editionId', 'O ID da edição do confronto');
    if (declaredTournamentId !== tournamentId || declaredEditionId !== editionId) {
      throw new ConflictException('O confronto deve pertencer à categoria e à edição da ação.');
    }
    const disciplineName = actionString(match, 'discipline', 'A modalidade do confronto', {
      min: 2,
      max: 100,
    });
    if (disciplineName !== discipline.name) {
      throw new ConflictException('A modalidade do confronto não corresponde à categoria.');
    }
    const phaseName = actionString(match, 'phase', 'A fase do confronto', { min: 1, max: 160 });
    const phaseContext = await this.resolvePhaseContext(tx, tournamentId, phaseName);
    const entryAName = actionString(match, 'entryA', 'O participante A', { min: 1, max: 180 });
    const entryBName = actionString(match, 'entryB', 'O participante B', { min: 1, max: 180 });
    if (entryAName === entryBName) {
      throw new ConflictException('Os participantes do confronto devem ser diferentes.');
    }
    const [entryAId, entryBId] = await Promise.all([
      this.entryIdByName(tx, tournamentId, entryAName),
      this.entryIdByName(tx, tournamentId, entryBName),
    ]);
    const date = actionDate(match, 'date', 'A data do confronto');
    const time = actionTime(match, 'time', 'O horário do confronto');
    const venue = actionString(match, 'venue', 'O local do confronto', { min: 2, max: 200 });
    if (await tx.match.findUnique({ where: { id }, select: { id: true } })) {
      throw new ConflictException(`Já existe uma partida com o ID ${id}.`);
    }
    await tx.match.create({
      data: {
        id,
        phaseId: phaseContext.phaseId,
        groupId: phaseContext.groupId,
        entryAId,
        entryBId,
        status: MatchStatus.SCHEDULED,
        scheduledAt: scheduledAt(date, time),
        venue,
        scoreA: 0,
        scoreB: 0,
        currentPeriod: 1,
        clockSeconds: 0,
        paused: true,
        periodScoreA: 0,
        periodScoreB: 0,
      },
    });
  }

  private async resolvePhaseContext(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    name: string,
  ): Promise<{ phaseId: string; groupId: string | null }> {
    const group = await tx.group.findFirst({
      where: { name, phase: { tournamentId } },
      select: { id: true, phaseId: true },
    });
    if (group) return { phaseId: group.phaseId, groupId: group.id };
    const phase = await tx.phase.findFirst({
      where: { tournamentId, OR: [{ name }, { clientId: name }] },
      select: { id: true },
    });
    if (!phase) throw new NotFoundException(`A fase "${name}" não pertence à categoria.`);
    return { phaseId: phase.id, groupId: null };
  }

  private async entryIdByName(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    name: string,
  ): Promise<string> {
    const entries = await tx.tournamentEntry.findMany({
      where: {
        tournamentId,
        OR: [{ team: { name } }, { athlete: { name } }],
      },
      take: 2,
      select: { id: true },
    });
    if (entries.length !== 1) {
      throw new NotFoundException(
        `O participante "${name}" não está inscrito de forma inequívoca.`,
      );
    }
    return entries[0].id;
  }

  private tournamentConfig(
    setup: ParsedTournamentSetup,
    options: { existing?: Prisma.JsonValue | null; resetProgression?: boolean } = {},
  ): Prisma.InputJsonValue {
    const config: Record<string, unknown> = options.resetProgression
      ? {}
      : { ...(this.jsonRecord(options.existing) ?? {}) };
    config.generated = setup.generated;
    if (setup.advancement) config.advancement = setup.advancement;
    else delete config.advancement;
    if (options.resetProgression) {
      delete config.byes;
      delete config.progressionByes;
    } else if (setup.byes) {
      config.byes = setup.byes;
    }
    return toInputJson(config, 'A configuração da categoria');
  }

  private async disciplineOrThrow(
    context: EditionActionContext,
    name: string,
  ): Promise<{ id: string; name: string; isIndividual: boolean }> {
    const discipline = await context.transaction.editionDiscipline.findFirst({
      where: { editionId: context.edition.id, discipline: { name } },
      select: {
        id: true,
        discipline: { select: { name: true, isIndividual: true } },
      },
    });
    if (!discipline) throw new NotFoundException('A modalidade não pertence a esta edição.');
    return {
      id: discipline.id,
      name: discipline.discipline.name,
      isIndividual: discipline.discipline.isIndividual,
    };
  }

  private async tournamentOrThrow(
    context: EditionActionContext,
    id: string,
  ): Promise<{ id: string; editionDisciplineId: string; config: Prisma.JsonValue | null }> {
    const tournament = await context.transaction.tournament.findFirst({
      where: { id, editionDiscipline: { editionId: context.edition.id } },
      select: { id: true, editionDisciplineId: true, config: true },
    });
    if (!tournament) throw new NotFoundException('Categoria não encontrada nesta edição.');
    return tournament;
  }

  private async structureSignature(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ): Promise<string> {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        format: true,
        config: true,
        entries: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            seed: true,
            team: { select: { name: true } },
            athlete: { select: { name: true } },
          },
        },
        phases: {
          orderBy: { order: 'asc' },
          select: {
            clientId: true,
            name: true,
            type: true,
            config: true,
            groups: {
              orderBy: { name: 'asc' },
              select: { name: true, entries: { select: { entryId: true } } },
            },
          },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Categoria não encontrada nesta edição.');
    const namesByEntryId = new Map(
      tournament.entries.map((entry) => [entry.id, entry.team?.name ?? entry.athlete?.name ?? '']),
    );
    const config = this.jsonRecord(tournament.config);
    return JSON.stringify({
      format: tournament.format,
      participants: tournament.entries
        .map((entry) => ({
          name: entry.team?.name ?? entry.athlete?.name ?? '',
          seed: entry.seed,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
      phases: tournament.phases.map((phase) => ({
        clientId: phase.clientId,
        name: phase.name,
        type: phase.type,
        qualifiers: this.jsonNumber(this.jsonRecord(phase.config)?.qualifiers, 1),
        groups: phase.groups.map((group) => ({
          name: group.name,
          participants: group.entries
            .map((entry) => namesByEntryId.get(entry.entryId) ?? '')
            .sort((left, right) => left.localeCompare(right, 'pt-BR')),
        })),
      })),
      advancement: this.structureAdvancement(config?.advancement),
    });
  }

  private requestedStructureSignature(setup: ParsedTournamentSetup): string {
    return JSON.stringify({
      format: inferTournamentFormat(setup.phases),
      participants: setup.participants
        .map((name) => ({ name, seed: setup.seeds[name] ?? null }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
      phases: setup.phases.map((phase) => ({
        clientId: phase.clientId,
        name: phase.name,
        type: phase.type,
        qualifiers: phase.qualifiers,
        groups: [...phase.groups]
          .sort((left, right) => left.localeCompare(right, 'pt-BR'))
          .map((name) => ({
            name,
            participants: setup.participants
              .filter((participant) => setup.assignments[participant] === name)
              .sort((left, right) => left.localeCompare(right, 'pt-BR')),
          })),
      })),
      advancement: this.structureAdvancement(setup.advancement),
    });
  }

  private structureAdvancement(value: unknown): Record<string, unknown> | null {
    const advancement = this.jsonRecord(value);
    if (!advancement) return null;
    return {
      perGroup: this.jsonNumber(advancement.perGroup, 2),
      bestThirds: this.jsonNumber(advancement.bestThirds, 0),
      crossing:
        advancement.crossing === 'sequencial' || advancement.crossing === 'padrao'
          ? advancement.crossing
          : 'padrao',
      thirdPlaceMatch: advancement.thirdPlaceMatch === true,
    };
  }

  private jsonNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
