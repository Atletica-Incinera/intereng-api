import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RosterStatus } from '@prisma/client';
import { UploadsService } from '../../uploads/uploads.service';
import {
  actionArray,
  actionEnum,
  actionId,
  actionObject,
  actionString,
  optionalActionBoolean,
  optionalActionString,
  slugify,
  toInputJson,
} from '../action-validation';
import { EditionActionContext, ActionMutationResult } from '../edition-actions.types';

const TEAM_FIELDS = [
  'name',
  'initials',
  'responsible',
  'logo',
  'archived',
  'created',
  'tone',
] as const;
const ATHLETE_FIELDS = ['name', 'teamId', 'modalities', 'created', 'removed'] as const;
const DISCIPLINE_FIELDS = [
  'config',
  'rules',
  'enabled',
  'created',
  'name',
  'mode',
  'tournaments',
  'tone',
  // O snapshot emite `startedAt` da modalidade, e o cliente devolve o objeto
  // inteiro ao alterar qualquer coisa nela. Aceito para não recusar com 400 o
  // que o próprio servidor mandou, e ignorado aqui porque quem o define é o
  // início da primeira partida — mesmo tratamento já dado a `standings` da fase
  // em category-action.handler.ts.
  'startedAt',
] as const;

@Injectable()
export class CatalogActionHandler {
  constructor(private readonly uploads: UploadsService) {}

  async disciplineUpdate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['name', 'patch']);
    const name = actionString(payload, 'name', 'O nome da modalidade', { min: 2, max: 100 });
    const patch = actionObject(payload.patch, 'A alteração da modalidade', DISCIPLINE_FIELDS);
    if (patch.name !== undefined) {
      const patchName = actionString(patch, 'name', 'O nome da modalidade', {
        min: 2,
        max: 100,
      });
      if (patchName !== name) {
        throw new ConflictException('O nome da modalidade não pode ser alterado nesta operação.');
      }
    }

    const mode =
      patch.mode === undefined
        ? undefined
        : actionEnum(patch, 'mode', 'O tipo da modalidade', ['Coletiva', 'Individual'] as const);
    const description = optionalActionString(patch, 'config', 'A descrição da modalidade', {
      min: 1,
      max: 2_000,
    });
    const enabled = optionalActionBoolean(patch, 'enabled', 'O estado da modalidade');
    if (patch.rules !== undefined) {
      actionObject(patch.rules, 'As regras da modalidade');
    }

    const tx = context.transaction;
    let discipline = await tx.discipline.findFirst({
      where: { OR: [{ name }, { slug: slugify(name) }] },
      select: { id: true, name: true, description: true, isIndividual: true },
    });
    if (!discipline) {
      discipline = await tx.discipline.create({
        data: {
          name,
          slug: slugify(name),
          isIndividual: mode === 'Individual',
          ...(description !== undefined ? { description } : {}),
        },
        select: { id: true, name: true, description: true, isIndividual: true },
      });
    } else if (description !== undefined || mode !== undefined) {
      discipline = await tx.discipline.update({
        where: { id: discipline.id },
        data: {
          ...(description !== undefined ? { description } : {}),
          ...(mode !== undefined ? { isIndividual: mode === 'Individual' } : {}),
        },
        select: { id: true, name: true, description: true, isIndividual: true },
      });
    }

    const existingLink = await tx.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: {
          editionId: context.edition.id,
          disciplineId: discipline.id,
        },
      },
      select: { id: true, config: true },
    });
    const currentConfig = this.jsonRecord(existingLink?.config);
    const nextConfig: Record<string, unknown> = { ...currentConfig };
    if (patch.rules !== undefined) nextConfig.rules = patch.rules;
    if (enabled !== undefined) nextConfig.enabled = enabled;

    const link = existingLink
      ? await tx.editionDiscipline.update({
          where: { id: existingLink.id },
          data: { config: toInputJson(nextConfig, 'A configuração da modalidade') },
          select: { id: true },
        })
      : await tx.editionDiscipline.create({
          data: {
            editionId: context.edition.id,
            disciplineId: discipline.id,
            config: toInputJson(nextConfig, 'A configuração da modalidade'),
          },
          select: { id: true },
        });

    const affectedEditionIds =
      description !== undefined || mode !== undefined
        ? (
            await tx.editionDiscipline.findMany({
              where: { disciplineId: discipline.id },
              orderBy: { editionId: 'asc' },
              select: { editionId: true },
            })
          ).map((item) => item.editionId)
        : undefined;
    return {
      entityType: 'EditionDiscipline',
      entityId: link.id,
      editionDisciplineId: link.id,
      ...(affectedEditionIds ? { affectedEditionIds } : {}),
    };
  }

  async teamCreate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'team']);
    const id = actionId(payload, 'id', 'O ID da equipe');
    const team = actionObject(payload.team, 'A equipe', TEAM_FIELDS);
    const name = actionString(team, 'name', 'O nome da equipe', { min: 2, max: 160 });
    const initials = optionalActionString(team, 'initials', 'A sigla da equipe', {
      min: 1,
      max: 20,
    });
    const responsible = optionalActionString(team, 'responsible', 'O responsável da equipe', {
      min: 2,
      max: 160,
    });
    const logoKey = optionalActionString(team, 'logo', 'A chave do logotipo', {
      min: 1,
      max: 512,
      trim: false,
    });
    if (logoKey !== undefined) {
      throw new BadRequestException(
        'Crie a equipe antes de enviar o logotipo para o armazenamento.',
      );
    }
    const archived = optionalActionBoolean(team, 'archived', 'O arquivamento da equipe') ?? false;

    if (await context.transaction.team.findUnique({ where: { id }, select: { id: true } })) {
      throw new ConflictException('Já existe uma equipe com o ID informado.');
    }

    const created = await context.transaction.team.create({
      data: {
        id,
        name,
        slug: slugify(id),
        ...(initials !== undefined ? { initials } : {}),
        ...(responsible !== undefined ? { responsible } : {}),
        ...(logoKey !== undefined ? { logoKey } : {}),
        archived,
        editionLinks: {
          create: { editionId: context.edition.id, archived },
        },
      },
      select: { id: true },
    });
    return { entityType: 'Team', entityId: created.id };
  }

  async teamUpdate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID da equipe');
    const patch = actionObject(payload.patch, 'A alteração da equipe', TEAM_FIELDS);
    const link = await context.transaction.editionTeam.findUnique({
      where: { editionId_teamId: { editionId: context.edition.id, teamId: id } },
      select: { id: true },
    });
    if (!link) throw new NotFoundException('Equipe não encontrada nesta edição.');

    const name = optionalActionString(patch, 'name', 'O nome da equipe', { min: 2, max: 160 });
    const initials = optionalActionString(patch, 'initials', 'A sigla da equipe', {
      min: 1,
      max: 20,
    });
    const responsible = optionalActionString(patch, 'responsible', 'O responsável da equipe', {
      min: 2,
      max: 160,
    });
    const logoKey = optionalActionString(patch, 'logo', 'A chave do logotipo', {
      min: 1,
      max: 512,
      trim: false,
    });
    if (logoKey !== undefined) await this.uploads.assertValidTeamLogo(id, logoKey);
    const archived = optionalActionBoolean(patch, 'archived', 'O arquivamento da equipe');

    const changesGlobalData =
      name !== undefined ||
      initials !== undefined ||
      responsible !== undefined ||
      logoKey !== undefined;
    if (changesGlobalData) {
      await context.transaction.team.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(initials !== undefined ? { initials } : {}),
          ...(responsible !== undefined ? { responsible } : {}),
          ...(logoKey !== undefined ? { logoKey } : {}),
        },
      });
    }
    if (archived !== undefined) {
      await context.transaction.editionTeam.update({
        where: { editionId_teamId: { editionId: context.edition.id, teamId: id } },
        data: { archived },
      });
    }
    const affectedEditionIds = changesGlobalData
      ? (
          await context.transaction.editionTeam.findMany({
            where: { teamId: id },
            orderBy: { editionId: 'asc' },
            select: { editionId: true },
          })
        ).map((item) => item.editionId)
      : undefined;
    return {
      entityType: 'Team',
      entityId: id,
      ...(affectedEditionIds ? { affectedEditionIds } : {}),
    };
  }

  async athleteCreate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'athlete']);
    const id = actionId(payload, 'id', 'O ID do atleta');
    const athlete = actionObject(payload.athlete, 'O atleta', ATHLETE_FIELDS);
    const name = actionString(athlete, 'name', 'O nome do atleta', { min: 3, max: 180 });
    const teamId = this.optionalTeamId(athlete);
    const modalities = this.modalities(athlete, true);
    const removed = optionalActionBoolean(athlete, 'removed', 'A remoção do atleta') ?? false;

    if (await context.transaction.athlete.findUnique({ where: { id }, select: { id: true } })) {
      throw new ConflictException('Já existe um atleta com o ID informado.');
    }
    if (teamId) await this.assertEditionTeam(context, teamId);

    await context.transaction.athlete.create({
      data: {
        id,
        name,
        editionLinks: {
          create: {
            editionId: context.edition.id,
            ...(teamId ? { teamId } : {}),
            removed,
          },
        },
      },
    });
    await this.syncRosters(context, id, teamId, modalities, removed);
    return { entityType: 'Athlete', entityId: id };
  }

  async athleteUpdate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID do atleta');
    const patch = actionObject(payload.patch, 'A alteração do atleta', ATHLETE_FIELDS);
    const editionAthlete = await context.transaction.editionAthlete.findUnique({
      where: { editionId_athleteId: { editionId: context.edition.id, athleteId: id } },
      select: { teamId: true, removed: true },
    });
    if (!editionAthlete) throw new NotFoundException('Atleta não encontrado nesta edição.');

    const name = optionalActionString(patch, 'name', 'O nome do atleta', { min: 3, max: 180 });
    const teamId =
      patch.teamId === undefined ? editionAthlete.teamId : (this.optionalTeamId(patch) ?? null);
    const removed =
      optionalActionBoolean(patch, 'removed', 'A remoção do atleta') ?? editionAthlete.removed;
    const modalities = this.modalities(patch, false);
    if (teamId) await this.assertEditionTeam(context, teamId);

    if (name !== undefined) {
      await context.transaction.athlete.update({ where: { id }, data: { name } });
    }
    await context.transaction.editionAthlete.update({
      where: { editionId_athleteId: { editionId: context.edition.id, athleteId: id } },
      data: { teamId, removed },
    });
    await this.syncRosters(context, id, teamId, modalities, removed);
    const affectedEditionIds = name
      ? (
          await context.transaction.editionAthlete.findMany({
            where: { athleteId: id },
            orderBy: { editionId: 'asc' },
            select: { editionId: true },
          })
        ).map((item) => item.editionId)
      : undefined;
    return {
      entityType: 'Athlete',
      entityId: id,
      ...(affectedEditionIds ? { affectedEditionIds } : {}),
    };
  }

  private optionalTeamId(record: Record<string, unknown>): string | undefined {
    if (record.teamId === undefined || record.teamId === null || record.teamId === '')
      return undefined;
    return actionId(record, 'teamId', 'O ID da equipe');
  }

  private modalities(record: Record<string, unknown>, required: boolean): string[] | undefined {
    if (record.modalities === undefined) {
      if (required) throw new ConflictException('Informe as modalidades do atleta.');
      return undefined;
    }
    const values = actionArray(record.modalities, 'As modalidades', 100).map((value, index) => {
      if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 100) {
        throw new ConflictException(`A modalidade na posição ${index + 1} é inválida.`);
      }
      return value.trim();
    });
    if (new Set(values).size !== values.length) {
      throw new ConflictException('As modalidades do atleta não podem ser repetidas.');
    }
    return values;
  }

  private async assertEditionTeam(context: EditionActionContext, teamId: string): Promise<void> {
    const team = await context.transaction.editionTeam.findUnique({
      where: { editionId_teamId: { editionId: context.edition.id, teamId } },
      select: { teamId: true },
    });
    if (!team) throw new NotFoundException('A equipe informada não pertence a esta edição.');
  }

  private async syncRosters(
    context: EditionActionContext,
    athleteId: string,
    teamId: string | null | undefined,
    modalities: string[] | undefined,
    removed: boolean,
  ): Promise<void> {
    const tx = context.transaction;
    const current = await tx.editionRoster.findMany({
      where: { athleteId, editionDiscipline: { editionId: context.edition.id } },
      select: { id: true, editionDisciplineId: true },
    });

    if (modalities === undefined) {
      await tx.editionRoster.updateMany({
        where: { id: { in: current.map((item) => item.id) } },
        data: {
          teamId: teamId ?? null,
          status: removed ? RosterStatus.WITHDRAWN : RosterStatus.ACTIVE,
        },
      });
      return;
    }

    const disciplineLinks = await tx.editionDiscipline.findMany({
      where: {
        editionId: context.edition.id,
        discipline: { name: { in: modalities } },
      },
      select: { id: true, discipline: { select: { name: true } } },
    });
    const foundNames = new Set(disciplineLinks.map((item) => item.discipline.name));
    const missing = modalities.filter((name) => !foundNames.has(name));
    if (missing.length) {
      throw new NotFoundException(
        `Modalidade(s) não encontrada(s) na edição: ${missing.join(', ')}.`,
      );
    }

    const activeIds = disciplineLinks.map((item) => item.id);
    await tx.editionRoster.updateMany({
      where: {
        athleteId,
        editionDiscipline: { editionId: context.edition.id },
        editionDisciplineId: { notIn: activeIds },
      },
      data: { status: RosterStatus.WITHDRAWN, teamId: teamId ?? null },
    });
    for (const discipline of disciplineLinks) {
      await tx.editionRoster.upsert({
        where: {
          editionDisciplineId_athleteId: {
            editionDisciplineId: discipline.id,
            athleteId,
          },
        },
        create: {
          editionDisciplineId: discipline.id,
          athleteId,
          teamId: teamId ?? null,
          status: removed ? RosterStatus.WITHDRAWN : RosterStatus.ACTIVE,
        },
        update: {
          teamId: teamId ?? null,
          status: removed ? RosterStatus.WITHDRAWN : RosterStatus.ACTIVE,
        },
      });
    }
  }

  private jsonRecord(value: Prisma.JsonValue | undefined | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}
