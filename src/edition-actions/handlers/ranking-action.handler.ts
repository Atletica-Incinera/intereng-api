import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  actionArray,
  actionId,
  actionNumber,
  actionObject,
  actionString,
  optionalActionNumber,
  optionalActionString,
  requireActionReason,
} from '../action-validation';
import { mapAwardOrigin, mapOverallPosition } from '../action-mappers';
import { seedDefaultOverallMetrics } from '../default-overall-metrics';
import { EditionActionAuditDto } from '../dto/edition-action.dto';
import { ActionMutationResult, EditionActionContext } from '../edition-actions.types';

const METRIC_FIELDS = ['id', 'name', 'defaultPoints', 'position'] as const;
const AWARD_FIELDS = [
  'id',
  'editionId',
  'teamId',
  'discipline',
  'metricId',
  'points',
  'note',
  'createdAt',
  'origin',
  'revokedAt',
  'revokedBy',
  'revokeReason',
] as const;

@Injectable()
export class RankingActionHandler {
  async addMetric(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['metric']);
    const metric = actionObject(payload.metric, 'A métrica', METRIC_FIELDS);
    const clientId = actionId(metric, 'id', 'O ID da métrica');
    const name = actionString(metric, 'name', 'O nome da métrica', { min: 2, max: 160 });
    const defaultPoints = actionNumber(metric, 'defaultPoints', 'A pontuação padrão', {
      min: -100_000,
      max: 100_000,
    });
    const position =
      metric.position === undefined
        ? undefined
        : mapOverallPosition(
            actionString(metric, 'position', 'A posição da métrica', {
              min: 1,
              max: 30,
            }),
          );
    await this.assertRankingOpen(context);

    const existing = await context.transaction.overallMetric.findUnique({
      where: { editionId_clientId: { editionId: context.edition.id, clientId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Já existe uma métrica com o ID informado.');

    const created = await context.transaction.overallMetric.create({
      data: {
        editionId: context.edition.id,
        clientId,
        name,
        defaultPoints,
        ...(position ? { position } : {}),
      },
      select: { id: true },
    });
    return { entityType: 'OverallMetric', entityId: created.id };
  }

  async updateMetric(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['metricId', 'patch']);
    const metricId = actionId(payload, 'metricId', 'O ID da métrica');
    const patch = actionObject(payload.patch, 'A alteração da métrica', METRIC_FIELDS);
    if (patch.id !== undefined && actionId(patch, 'id', 'O ID da métrica') !== metricId) {
      throw new ConflictException('O ID da métrica não pode ser alterado.');
    }
    await this.assertRankingOpen(context);
    const metric = await this.metricOrThrow(context, metricId);

    const name = optionalActionString(patch, 'name', 'O nome da métrica', {
      min: 2,
      max: 160,
    });
    const defaultPoints = optionalActionNumber(patch, 'defaultPoints', 'A pontuação padrão', {
      min: -100_000,
      max: 100_000,
    });
    // Os três casos precisam continuar distintos: campo ausente preserva a posição
    // atual, null volta a métrica para manual e texto grava a nova posição. Sem o
    // null explícito não existiria caminho para desligar a bonificação automática
    // do pódio, e a métrica continuaria pontuando sozinha depois de o operador
    // escolher "Manual" na tela.
    const rawPosition = optionalActionString(patch, 'position', 'A posição da métrica', {
      min: 1,
      max: 30,
      nullable: true,
    });
    const position = rawPosition === null ? null : mapOverallPosition(rawPosition);

    await context.transaction.overallMetric.update({
      where: { id: metric.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(defaultPoints !== undefined && defaultPoints !== null ? { defaultPoints } : {}),
        ...(position !== undefined ? { position } : {}),
      },
    });
    return { entityType: 'OverallMetric', entityId: metric.id };
  }

  async removeMetric(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    _audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['metricId']);
    const metricId = actionId(payload, 'metricId', 'O ID da métrica');
    await this.assertRankingOpen(context);
    const metric = await this.metricOrThrow(context, metricId);
    const activeAwards = await context.transaction.overallAward.count({
      where: {
        editionId: context.edition.id,
        metricId,
        revokedAt: null,
      },
    });
    if (activeAwards > 0) {
      throw new ConflictException('A métrica possui pontuações ativas e não pode ser removida.');
    }
    await context.transaction.overallMetric.update({
      where: { id: metric.id },
      data: { removedAt: new Date() },
    });
    return { entityType: 'OverallMetric', entityId: metric.id };
  }

  /**
   * Cria o catálogo padrão de métricas numa edição que ainda não pontua nada.
   *
   * Existe porque semear no caminho de criação não alcança quem já foi criado:
   * a edição de produção nasceu antes desta rotina e ficaria sem nenhuma
   * métrica — classificação geral zerada e bonificação de pódio sem o que
   * aplicar. Esta é a ação que o operador dispara pela tela para consertar isso.
   */
  async seedDefaultMetrics(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['editionId']);
    const editionId = actionId(payload, 'editionId', 'O ID da edição');
    if (editionId !== context.edition.id) {
      throw new ConflictException('As métricas padrão devem pertencer à edição da rota.');
    }
    await this.assertRankingOpen(context);
    await seedDefaultOverallMetrics(context.transaction, context.edition.id);
    // A ação age sobre o catálogo inteiro da edição, e num segundo clique não
    // cria linha nenhuma: o ID auditável que sempre existe é o da edição.
    return { entityType: 'OverallMetric', entityId: context.edition.id };
  }

  async addAwards(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['awards']);
    const awards = actionArray(payload.awards, 'As pontuações', 100);
    if (!awards.length) throw new ConflictException('Informe ao menos uma pontuação.');
    if (await this.isRankingClosed(context)) {
      requireActionReason(audit, 'A retificação de pontuações após o fechamento do ranking');
    }

    const ids = new Set<string>();
    let firstId = '';
    for (const [index, rawAward] of awards.entries()) {
      const award = actionObject(rawAward, `A pontuação ${index + 1}`, AWARD_FIELDS);
      const id = actionId(award, 'id', `O ID da pontuação ${index + 1}`);
      if (ids.has(id)) throw new ConflictException('A lista possui IDs de pontuação repetidos.');
      ids.add(id);
      firstId ||= id;
      const editionId = actionId(award, 'editionId', 'O ID da edição');
      if (editionId !== context.edition.id) {
        throw new ConflictException('A pontuação deve pertencer à edição da rota.');
      }
      const teamId = actionId(award, 'teamId', 'O ID da equipe');
      const disciplineName = actionString(award, 'discipline', 'A modalidade', {
        min: 2,
        max: 100,
      });
      const metricId = actionId(award, 'metricId', 'O ID da métrica');
      const points = actionNumber(award, 'points', 'A pontuação', {
        min: -100_000,
        max: 100_000,
      });
      const note = optionalActionString(award, 'note', 'A observação', {
        min: 1,
        max: 1_000,
      });
      const origin = mapAwardOrigin(
        award.origin === undefined
          ? undefined
          : actionString(award, 'origin', 'A origem da pontuação', { min: 1, max: 30 }),
      );

      const [team, discipline, metric, existingId, duplicate] = await Promise.all([
        context.transaction.editionTeam.findUnique({
          where: { editionId_teamId: { editionId: context.edition.id, teamId } },
          select: { id: true },
        }),
        context.transaction.editionDiscipline.findFirst({
          where: { editionId: context.edition.id, discipline: { name: disciplineName } },
          select: { id: true },
        }),
        context.transaction.overallMetric.findUnique({
          where: { editionId_clientId: { editionId: context.edition.id, clientId: metricId } },
          select: { id: true, removedAt: true },
        }),
        context.transaction.overallAward.findUnique({ where: { id }, select: { id: true } }),
        context.transaction.overallAward.findFirst({
          where: {
            editionId: context.edition.id,
            teamId,
            metricId,
            revokedAt: null,
            editionDiscipline: { discipline: { name: disciplineName } },
          },
          select: { id: true },
        }),
      ]);
      if (!team) throw new NotFoundException('A equipe da pontuação não pertence à edição.');
      if (!discipline)
        throw new NotFoundException('A modalidade da pontuação não pertence à edição.');
      if (!metric || metric.removedAt)
        throw new NotFoundException('A métrica da pontuação não está ativa.');
      if (existingId) throw new ConflictException(`A pontuação ${id} já existe.`);
      if (duplicate) {
        throw new ConflictException(
          'Já existe uma pontuação ativa desta métrica para a equipe e modalidade.',
        );
      }

      await context.transaction.overallAward.create({
        data: {
          id,
          editionId: context.edition.id,
          teamId,
          editionDisciplineId: discipline.id,
          metricId,
          points,
          ...(note !== undefined ? { note } : {}),
          origin,
        },
      });
    }
    return { entityType: 'OverallAward', entityId: firstId };
  }

  async revokeAward(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'revokedAt', 'revokedBy', 'revokeReason']);
    const id = actionId(payload, 'id', 'O ID da pontuação');
    const reason = actionString(payload, 'revokeReason', 'O motivo do estorno', {
      min: 5,
      max: 1_000,
    });
    if (await this.isRankingClosed(context)) {
      requireActionReason(audit, 'O estorno após o fechamento do ranking');
    }
    const award = await context.transaction.overallAward.findFirst({
      where: { id, editionId: context.edition.id },
      select: { id: true, revokedAt: true },
    });
    if (!award) throw new NotFoundException('Pontuação não encontrada nesta edição.');
    if (award.revokedAt) throw new ConflictException('A pontuação já foi estornada.');

    await context.transaction.overallAward.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedById: context.user.id,
        revokedByName: context.actorName,
        revokeReason: reason,
      },
    });
    return { entityType: 'OverallAward', entityId: id };
  }

  async close(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['closure']);
    const closure = actionObject(payload.closure, 'O fechamento', [
      'editionId',
      'at',
      'actor',
      'note',
    ]);
    const editionId = actionId(closure, 'editionId', 'O ID da edição');
    if (editionId !== context.edition.id) {
      throw new ConflictException('O fechamento deve pertencer à edição da rota.');
    }
    const note = optionalActionString(closure, 'note', 'A observação do fechamento', {
      min: 1,
      max: 1_000,
    });
    await this.assertRankingOpen(context);

    const created = await context.transaction.overallClosure.create({
      data: {
        editionId: context.edition.id,
        actorId: context.user.id,
        actorName: context.actorName,
        closedAt: new Date(),
        ...(note !== undefined ? { note } : {}),
      },
      select: { id: true },
    });
    return { entityType: 'OverallClosure', entityId: created.id };
  }

  async reopen(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['editionId']);
    const editionId = actionId(payload, 'editionId', 'O ID da edição');
    if (editionId !== context.edition.id) {
      throw new ConflictException('A reabertura deve pertencer à edição da rota.');
    }
    const reason = requireActionReason(audit, 'A reabertura do ranking');
    const closure = await context.transaction.overallClosure.findFirst({
      where: { editionId: context.edition.id, reopenedAt: null },
      orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!closure) throw new NotFoundException('O ranking desta edição não está fechado.');

    await context.transaction.overallClosure.update({
      where: { id: closure.id },
      data: {
        reopenedAt: new Date(),
        reopenedById: context.user.id,
        reopenReason: reason,
      },
    });
    return { entityType: 'OverallClosure', entityId: closure.id };
  }

  private async metricOrThrow(
    context: EditionActionContext,
    clientId: string,
  ): Promise<{ id: string }> {
    const metric = await context.transaction.overallMetric.findUnique({
      where: { editionId_clientId: { editionId: context.edition.id, clientId } },
      select: { id: true, removedAt: true },
    });
    if (!metric || metric.removedAt)
      throw new NotFoundException('Métrica não encontrada nesta edição.');
    return metric;
  }

  private async assertRankingOpen(context: EditionActionContext): Promise<void> {
    if (await this.isRankingClosed(context)) {
      throw new ConflictException('O ranking geral está fechado. Reabra-o antes de alterar dados.');
    }
  }

  private async isRankingClosed(context: EditionActionContext): Promise<boolean> {
    const closure = await context.transaction.overallClosure.findFirst({
      where: { editionId: context.edition.id, reopenedAt: null },
      select: { id: true },
    });
    return Boolean(closure);
  }
}
