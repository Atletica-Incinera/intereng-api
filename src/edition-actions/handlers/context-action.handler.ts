import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EditionStaffRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '../../common/config/config.service';
import {
  actionBoolean,
  actionDate,
  actionEmail,
  actionEnum,
  actionId,
  actionNumber,
  actionObject,
  actionString,
  optionalActionBoolean,
  optionalActionNumber,
  optionalActionString,
} from '../action-validation';
import { EDITION_STATUS_VALUES, mapEditionStatus } from '../action-mappers';
import { ActionMutationResult, EditionActionContext } from '../edition-actions.types';

const COMPETITION_FIELDS = ['id', 'name', 'slug', 'active'] as const;
const EDITION_FIELDS = [
  'id',
  'name',
  'year',
  'start',
  'end',
  'status',
  'active',
  'competitionId',
] as const;
const STAFF_FIELDS = [
  'roleAssignmentId',
  'name',
  'email',
  'initials',
  'role',
  'scope',
  'revoked',
] as const;

@Injectable()
export class ContextActionHandler {
  constructor(private readonly config: ConfigService) {}

  async competitionCreate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['competition', 'edition']);
    const competition = actionObject(payload.competition, 'A competição', COMPETITION_FIELDS);
    const edition = actionObject(payload.edition, 'A primeira edição', EDITION_FIELDS);
    const competitionId = actionId(competition, 'id', 'O ID da competição');
    const name = actionString(competition, 'name', 'O nome da competição', {
      min: 2,
      max: 160,
    });
    const slug = actionString(competition, 'slug', 'O slug da competição', {
      min: 2,
      max: 100,
    });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new ConflictException(
        'O slug da competição deve usar letras minúsculas, números e hífens.',
      );
    }
    const competitionActive = actionBoolean(competition, 'active', 'O estado da competição');
    const editionData = this.parseEdition(edition);
    if (editionData.competitionId !== competitionId) {
      throw new ConflictException('A primeira edição deve pertencer à competição criada.');
    }
    if (editionData.active !== competitionActive) {
      throw new ConflictException(
        'A primeira edição e a nova competição devem possuir o mesmo estado de ativação.',
      );
    }

    const [idCollision, slugCollision, editionCollision] = await Promise.all([
      context.transaction.competition.findUnique({
        where: { id: competitionId },
        select: { id: true },
      }),
      context.transaction.competition.findUnique({ where: { slug }, select: { id: true } }),
      context.transaction.competitionEdition.findUnique({
        where: { id: editionData.id },
        select: { id: true },
      }),
    ]);
    if (idCollision) throw new ConflictException('Já existe uma competição com o ID informado.');
    if (slugCollision) throw new ConflictException('O slug da competição já está em uso.');
    if (editionCollision) throw new ConflictException('Já existe uma edição com o ID informado.');

    const affectedEditionIds = await this.allEditionIds(context);
    if (competitionActive) {
      await context.transaction.competition.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await context.transaction.competitionEdition.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }
    await context.transaction.competition.create({
      data: { id: competitionId, name, slug, isActive: competitionActive },
    });
    await context.transaction.competitionEdition.create({
      data: {
        id: editionData.id,
        competitionId,
        name: editionData.name,
        year: editionData.year,
        startDate: editionData.startDate,
        endDate: editionData.endDate,
        status: editionData.status,
        isActive: editionData.active,
      },
    });
    return {
      entityType: 'Competition',
      entityId: competitionId,
      ...(competitionActive ? { responseEditionId: editionData.id } : {}),
      affectedEditionIds: [...affectedEditionIds, editionData.id],
    };
  }

  async competitionRename(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'name']);
    const id = actionId(payload, 'id', 'O ID da competição');
    const name = actionString(payload, 'name', 'O nome da competição', {
      min: 2,
      max: 160,
    });
    await this.competitionOrThrow(context, id);
    const affectedEditionIds = await this.allEditionIds(context);
    await context.transaction.competition.update({ where: { id }, data: { name } });
    return { entityType: 'Competition', entityId: id, affectedEditionIds };
  }

  async competitionActivate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id']);
    const id = actionId(payload, 'id', 'O ID da competição');
    await this.competitionOrThrow(context, id);
    const affectedEditionIds = await this.allEditionIds(context);
    const activeEdition = await context.transaction.competitionEdition.findFirst({
      where: { competitionId: id, isActive: true },
      orderBy: [{ year: 'desc' }, { id: 'asc' }],
      select: { id: true },
    });
    const targetEdition =
      activeEdition ??
      (await context.transaction.competitionEdition.findFirst({
        where: { competitionId: id },
        orderBy: [{ year: 'desc' }, { id: 'asc' }],
        select: { id: true },
      }));
    if (!targetEdition) {
      throw new ConflictException('A competição não possui uma edição para ativar.');
    }
    await context.transaction.competition.updateMany({
      where: { isActive: true, id: { not: id } },
      data: { isActive: false },
    });
    await context.transaction.competition.update({ where: { id }, data: { isActive: true } });
    await context.transaction.competitionEdition.updateMany({
      where: { isActive: true, id: { not: targetEdition.id } },
      data: { isActive: false },
    });
    await context.transaction.competitionEdition.update({
      where: { id: targetEdition.id },
      data: { isActive: true },
    });
    return {
      entityType: 'Competition',
      entityId: id,
      responseEditionId: targetEdition.id,
      affectedEditionIds,
    };
  }

  async editionCreate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['edition']);
    const edition = actionObject(payload.edition, 'A edição', EDITION_FIELDS);
    const data = this.parseEdition(edition);
    await this.competitionOrThrow(context, data.competitionId);
    if (
      await context.transaction.competitionEdition.findUnique({
        where: { id: data.id },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Já existe uma edição com o ID informado.');
    }
    const affectedEditionIds = await this.allEditionIds(context);
    if (data.active) {
      await context.transaction.competition.updateMany({
        where: { isActive: true, id: { not: data.competitionId } },
        data: { isActive: false },
      });
      await context.transaction.competition.update({
        where: { id: data.competitionId },
        data: { isActive: true },
      });
      await context.transaction.competitionEdition.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }
    await context.transaction.competitionEdition.create({
      data: {
        id: data.id,
        competitionId: data.competitionId,
        name: data.name,
        year: data.year,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        isActive: data.active,
      },
    });
    return {
      entityType: 'CompetitionEdition',
      entityId: data.id,
      ...(data.active ? { responseEditionId: data.id } : {}),
      affectedEditionIds: [...affectedEditionIds, data.id],
    };
  }

  async editionUpdate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID da edição');
    const patch = actionObject(payload.patch, 'A alteração da edição', EDITION_FIELDS);
    const current = await context.transaction.competitionEdition.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        year: true,
        startDate: true,
        endDate: true,
        competitionId: true,
      },
    });
    if (!current) throw new NotFoundException('Edição não encontrada.');
    if (patch.id !== undefined && actionId(patch, 'id', 'O ID da edição') !== id) {
      throw new ConflictException('O ID da edição não pode ser alterado.');
    }
    if (
      patch.competitionId !== undefined &&
      actionId(patch, 'competitionId', 'O ID da competição') !== current.competitionId
    ) {
      throw new ConflictException('A edição não pode ser movida para outra competição.');
    }
    if (patch.active !== undefined) {
      throw new ConflictException('Use a ação edition/activate para alterar a edição ativa.');
    }
    const name = optionalActionString(patch, 'name', 'O nome da edição', {
      min: 1,
      max: 160,
    });
    const year = optionalActionNumber(patch, 'year', 'O ano da edição', {
      min: 1900,
      max: 2200,
    });
    const start =
      patch.start === undefined ? undefined : actionDate(patch, 'start', 'A data inicial');
    const end = patch.end === undefined ? undefined : actionDate(patch, 'end', 'A data final');
    const startDate = start ? new Date(`${start}T00:00:00.000Z`) : current.startDate;
    const endDate = end ? new Date(`${end}T00:00:00.000Z`) : current.endDate;
    if (endDate < startDate) {
      throw new ConflictException('A data final deve ser igual ou posterior à data inicial.');
    }
    const status =
      patch.status === undefined
        ? undefined
        : mapEditionStatus(
            actionEnum(patch, 'status', 'O status da edição', EDITION_STATUS_VALUES),
          );

    const affectedEditionIds = await this.allEditionIds(context);
    await context.transaction.competitionEdition.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(year !== undefined && year !== null ? { year } : {}),
        ...(start !== undefined ? { startDate } : {}),
        ...(end !== undefined ? { endDate } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    return { entityType: 'CompetitionEdition', entityId: id, affectedEditionIds };
  }

  async editionActivate(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id']);
    const id = actionId(payload, 'id', 'O ID da edição');
    const edition = await context.transaction.competitionEdition.findUnique({
      where: { id },
      select: { id: true, competitionId: true },
    });
    if (!edition) throw new NotFoundException('Edição não encontrada.');
    const affectedEditionIds = await this.allEditionIds(context);
    await context.transaction.competition.updateMany({
      where: { isActive: true, id: { not: edition.competitionId } },
      data: { isActive: false },
    });
    await context.transaction.competition.update({
      where: { id: edition.competitionId },
      data: { isActive: true },
    });
    await context.transaction.competitionEdition.updateMany({
      where: { isActive: true, id: { not: id } },
      data: { isActive: false },
    });
    await context.transaction.competitionEdition.update({
      where: { id },
      data: { isActive: true },
    });
    return {
      entityType: 'CompetitionEdition',
      entityId: id,
      responseEditionId: id,
      affectedEditionIds,
    };
  }

  async staffUpsert(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['email', 'member']);
    const email = actionEmail(payload, 'email', 'O e-mail do membro');
    const member = actionObject(payload.member, 'O membro do staff', STAFF_FIELDS);
    const memberEmail = actionEmail(member, 'email', 'O e-mail do membro');
    if (memberEmail !== email) {
      throw new ConflictException('O e-mail do membro deve ser igual à chave informada.');
    }
    const name = actionString(member, 'name', 'O nome do membro', { min: 2, max: 160 });
    const roleAssignmentId =
      member.roleAssignmentId === undefined
        ? undefined
        : actionId(member, 'roleAssignmentId', 'O ID da atribuição do membro');
    const role = actionEnum(member, 'role', 'O papel do membro', [
      'Admin da edição',
      'Gestor de modalidade',
    ] as const);
    const scopeName = actionString(member, 'scope', 'O escopo do membro', {
      min: 1,
      max: 160,
    });
    const revoked = optionalActionBoolean(member, 'revoked', 'A revogação do membro') ?? false;

    let editionDisciplineId: string | null = null;
    if (role === 'Gestor de modalidade') {
      const discipline = await context.transaction.editionDiscipline.findFirst({
        where: { editionId: context.edition.id, discipline: { name: scopeName } },
        select: { id: true },
      });
      if (!discipline) throw new NotFoundException('A modalidade do escopo não pertence à edição.');
      editionDisciplineId = discipline.id;
    }

    let staff = await context.transaction.staff.findUnique({
      where: { email },
      select: { id: true, name: true, isSuperAdmin: true },
    });
    if (!staff) {
      const passwordHash = await bcrypt.hash(this.config.staffInvitePassword, 10);
      staff = await context.transaction.staff.create({
        data: { name, email, passwordHash, isSuperAdmin: false },
        select: { id: true, name: true, isSuperAdmin: true },
      });
    } else if (!context.user.isSuperAdmin) {
      if (staff.isSuperAdmin) {
        throw new ForbiddenException(
          'O administrador da edição não pode alterar uma conta de super administrador.',
        );
      }
      if (staff.name !== name) {
        throw new ForbiddenException(
          'O administrador da edição não pode alterar a identidade global de um membro existente.',
        );
      }
    } else if (staff.name !== name) {
      await context.transaction.staff.update({ where: { id: staff.id }, data: { name } });
    }

    const targetRole =
      role === 'Admin da edição'
        ? EditionStaffRoleType.EDITION_ADMIN
        : EditionStaffRoleType.DISCIPLINE_MANAGER;
    const matchingRoleWhere = {
      editionId: context.edition.id,
      staffId: staff.id,
      role: targetRole,
      editionDisciplineId,
      revokedAt: null,
    };

    if (!roleAssignmentId && revoked) {
      throw new BadRequestException(
        'O ID da atribuição do membro é obrigatório para revogar um acesso.',
      );
    }

    const previousAssignment = roleAssignmentId
      ? await context.transaction.editionStaffRole.findFirst({
          where: {
            id: roleAssignmentId,
            editionId: context.edition.id,
            staffId: staff.id,
          },
          select: {
            id: true,
            role: true,
            editionDisciplineId: true,
            revokedAt: true,
          },
        })
      : null;
    if (roleAssignmentId && !previousAssignment) {
      throw new NotFoundException('A atribuição informada não pertence a este membro e edição.');
    }

    if (revoked && previousAssignment) {
      if (!previousAssignment.revokedAt) {
        await context.transaction.editionStaffRole.update({
          where: { id: previousAssignment.id },
          data: { revokedAt: new Date(), revokedById: context.user.id },
        });
      }
    } else {
      const assignmentAlreadyMatches =
        previousAssignment?.revokedAt === null &&
        previousAssignment.role === targetRole &&
        previousAssignment.editionDisciplineId === editionDisciplineId;

      if (previousAssignment && !previousAssignment.revokedAt && !assignmentAlreadyMatches) {
        await context.transaction.editionStaffRole.update({
          where: { id: previousAssignment.id },
          data: { revokedAt: new Date(), revokedById: context.user.id },
        });
      }

      const activeRole = assignmentAlreadyMatches
        ? previousAssignment
        : await context.transaction.editionStaffRole.findFirst({
            where: matchingRoleWhere,
            select: { id: true },
          });
      if (!activeRole) {
        await context.transaction.editionStaffRole.create({
          data: {
            editionId: context.edition.id,
            staffId: staff.id,
            role: targetRole,
            editionDisciplineId,
          },
        });
      }
    }
    return {
      entityType: 'Staff',
      entityId: staff.id,
      affectedEditionIds: await this.allEditionIds(context),
    };
  }

  private parseEdition(record: Record<string, unknown>): {
    id: string;
    competitionId: string;
    name: string;
    year: number;
    startDate: Date;
    endDate: Date;
    status: ReturnType<typeof mapEditionStatus>;
    active: boolean;
  } {
    const id = actionId(record, 'id', 'O ID da edição');
    const competitionId = actionId(record, 'competitionId', 'O ID da competição');
    const name = actionString(record, 'name', 'O nome da edição', { min: 1, max: 160 });
    const year = actionNumber(record, 'year', 'O ano da edição', {
      min: 1900,
      max: 2200,
    });
    const start = actionDate(record, 'start', 'A data inicial');
    const end = actionDate(record, 'end', 'A data final');
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T00:00:00.000Z`);
    if (endDate < startDate) {
      throw new ConflictException('A data final deve ser igual ou posterior à data inicial.');
    }
    const status = mapEditionStatus(
      actionEnum(record, 'status', 'O status da edição', EDITION_STATUS_VALUES),
    );
    const active = actionBoolean(record, 'active', 'O estado da edição');
    return { id, competitionId, name, year, startDate, endDate, status, active };
  }

  private async competitionOrThrow(
    context: EditionActionContext,
    id: string,
  ): Promise<{ id: string }> {
    const competition = await context.transaction.competition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competição não encontrada.');
    return competition;
  }

  private async allEditionIds(context: EditionActionContext): Promise<string[]> {
    const editions = await context.transaction.competitionEdition.findMany({
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return editions.map((edition) => edition.id);
  }
}
