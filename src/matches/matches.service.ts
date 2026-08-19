import { Injectable, NotFoundException, BadRequestException, GoneException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchStatus, Prisma } from '@prisma/client';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { validateDifferentEntries } from './domain/match.domain';

@Injectable()
export class MatchesService {
  /**
   * Constant representing the relation inclusions needed to load
   * full match details (entry A and B with their respective teams and athletes).
   */
  private static readonly MATCH_RELATIONS_INCLUDE = {
    entryA: { include: { team: true, athlete: true } },
    entryB: { include: { team: true, athlete: true } },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Helper method to validate phase existence and optionally retrieve its tournament and edition relations.
   *
   * @param phaseId - The ID of the phase to check.
   * @param includeRelations - Whether to include tournament and edition relation fields.
   * @returns The phase record.
   * @throws NotFoundException if the phase does not exist.
   */
  private async getPhaseOrThrow(phaseId: string, includeRelations = false) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: includeRelations
        ? {
            tournament: {
              include: { editionDiscipline: true },
            },
          }
        : undefined,
    });
    if (!phase) {
      throw new NotFoundException(`Fase com ID "${phaseId}" não encontrada.`);
    }
    return phase;
  }

  /**
   * Helper method to retrieve a match by ID along with its phase, tournament, and edition discipline relations.
   *
   * @param id - The ID of the match to retrieve.
   * @returns The match record with loaded phase relationships.
   * @throws NotFoundException if the match does not exist.
   */
  private async getMatchWithPhaseRelationsOrThrow(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        phase: {
          include: {
            tournament: {
              include: { editionDiscipline: true },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Partida com ID "${id}" não encontrada.`);
    }

    return match;
  }

  /**
   * Helper method to validate if a group belongs to a specific phase.
   *
   * @param groupId - The ID of the group to validate.
   * @param phaseId - The ID of the phase the group should belong to.
   * @throws BadRequestException if the group does not exist or does not belong to the phase.
   */
  private async validateGroupBelongsToPhase(groupId: string, phaseId: string): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group || group.phaseId !== phaseId) {
      throw new BadRequestException(`Grupo com ID "${groupId}" não pertence a esta fase.`);
    }
  }

  /**
   * Helper method to validate if a tournament entry belongs to a specific tournament.
   *
   * @param entryId - The ID of the tournament entry to validate.
   * @param tournamentId - The ID of the tournament the entry should belong to.
   * @param entryRole - The label/role of the entry (e.g. 'entryAId' or 'entryBId') for error messaging.
   * @throws BadRequestException if the entry does not exist or does not belong to the tournament.
   */
  private async validateEntryBelongsToTournament(
    entryId: string,
    tournamentId: string,
    entryRole: 'entryAId' | 'entryBId',
  ): Promise<void> {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry || entry.tournamentId !== tournamentId) {
      throw new BadRequestException(
        `Inscrição ${entryRole} "${entryId}" não pertence a este torneio.`,
      );
    }
  }

  /**
   * Helper method to validate tournament entries for a match.
   *
   * @param entryAId - The ID of entry A (if provided).
   * @param entryBId - The ID of entry B (if provided).
   * @param tournamentId - The ID of the tournament they must belong to.
   * @throws BadRequestException if any entry does not belong to the tournament.
   */
  private async validateMatchEntries(
    entryAId: string | null | undefined,
    entryBId: string | null | undefined,
    tournamentId: string,
  ): Promise<void> {
    if (entryAId) {
      await this.validateEntryBelongsToTournament(entryAId, tournamentId, 'entryAId');
    }
    if (entryBId) {
      await this.validateEntryBelongsToTournament(entryBId, tournamentId, 'entryBId');
    }
  }

  /**
   * Retrieves all matches for a given phase, filterable by status and round.
   *
   * @param phaseId - The ID of the phase.
   * @param status - Optional match status to filter by.
   * @param round - Optional round number to filter by.
   * @returns A list of matches matching the filters.
   * @throws NotFoundException if the phase does not exist.
   */
  async findAllMatches(phaseId: string, status?: MatchStatus, round?: number) {
    await this.getPhaseOrThrow(phaseId);

    return this.prisma.match.findMany({
      where: {
        phaseId,
        ...(status ? { status } : {}),
        ...(round !== undefined ? { round } : {}),
      },
      include: MatchesService.MATCH_RELATIONS_INCLUDE,
      orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }, { scheduledAt: 'asc' }],
    });
  }

  /**
   * Retrieves a single match by its ID.
   *
   * @param id - The ID of the match to retrieve.
   * @returns The match record.
   * @throws NotFoundException if the match does not exist.
   */
  async findMatchById(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: MatchesService.MATCH_RELATIONS_INCLUDE,
    });

    if (!match) {
      throw new NotFoundException(`Partida com ID "${id}" não encontrada.`);
    }

    return match;
  }

  /**
   * Creates a new match within a phase.
   *
   * @param phaseId - The ID of the phase to create the match in.
   * @param dto - The DTO containing the details for the new match.
   * @param staffId - The ID of the staff member performing the creation.
   * @returns The created Match object, including populated entry A and entry B relations.
   *
   * @throws NotFoundException
   * This is thrown if the specified phase is not found in the database.
   *
   * @throws BadRequestException
   * This is thrown in the following cases:
   * - The provided group does not exist or does not belong to the specified phase.
   * - Either entry A or entry B does not exist or does not belong to the phase's tournament.
   * - Both entry A and entry B are identical.
   *
   * @remarks
   * Side Effects / Efeitos Colaterais:
   * - Executes within a database transaction.
   * - Records a 'CREATE' audit log for the created Match using `AuditService`.
   */
  async createMatch(phaseId: string, dto: CreateMatchDto, staffId: string) {
    const phaseRaw = await this.getPhaseOrThrow(phaseId, true);
    const phase = phaseRaw as Prisma.PhaseGetPayload<{
      include: {
        tournament: {
          include: { editionDiscipline: true };
        };
      };
    }>;
    const tournamentId = phase.tournamentId;
    const editionId = phase.tournament.editionDiscipline.editionId;

    if (dto.groupId) {
      await this.validateGroupBelongsToPhase(dto.groupId, phaseId);
    }

    await this.validateMatchEntries(
      dto.entryAId || undefined,
      dto.entryBId || undefined,
      tournamentId,
    );

    try {
      validateDifferentEntries(dto.entryAId, dto.entryBId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }

    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          phaseId,
          groupId: dto.groupId || null,
          round: dto.round !== undefined ? dto.round : null,
          bracketSlot: dto.bracketSlot !== undefined ? dto.bracketSlot : null,
          entryAId: dto.entryAId || null,
          entryBId: dto.entryBId || null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          venue: dto.venue || null,
          scoreA: 0,
          scoreB: 0,
          lastEventSequence: 0,
          status: 'SCHEDULED',
        },
        include: MatchesService.MATCH_RELATIONS_INCLUDE,
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'Match',
          entityId: match.id,
          after: match,
        },
        tx,
      );

      return match;
    });
  }

  /**
   * Updates an existing match's details.
   *
   * @param id - The ID of the match to update.
   * @param dto - The DTO containing the fields to update.
   * @param staffId - The ID of the staff member performing the update.
   * @returns The updated Match object, including populated entry A and entry B relations.
   *
   * @throws NotFoundException
   * This is thrown if the specified match does not exist.
   *
   * @throws BadRequestException
   * This is thrown in the following cases:
   * - The provided group does not belong to the phase of the match.
   * - Either entry A or entry B does not belong to the tournament of the match.
   * - The update results in both entries of the match being identical.
   *
   * @remarks
   * Side Effects / Efeitos Colaterais:
   * - Executes within a database transaction.
   * - Records an 'UPDATE' audit log for the Match using `AuditService`.
   */
  async updateMatch(id: string, dto: UpdateMatchDto, staffId: string) {
    const match = await this.getMatchWithPhaseRelationsOrThrow(id);

    const tournamentId = match.phase.tournamentId;
    const editionId = match.phase.tournament.editionDiscipline.editionId;

    if (dto.groupId !== undefined && dto.groupId !== null) {
      await this.validateGroupBelongsToPhase(dto.groupId, match.phaseId);
    }

    await this.validateMatchEntries(
      dto.entryAId || undefined,
      dto.entryBId || undefined,
      tournamentId,
    );

    const finalEntryAId = dto.entryAId !== undefined ? dto.entryAId : match.entryAId;
    const finalEntryBId = dto.entryBId !== undefined ? dto.entryBId : match.entryBId;

    try {
      validateDifferentEntries(finalEntryAId, finalEntryBId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.MatchUpdateInput = {};

      if (dto.groupId !== undefined) {
        data.group = dto.groupId ? { connect: { id: dto.groupId } } : { disconnect: true };
      }
      if (dto.round !== undefined) {
        data.round = dto.round;
      }
      if (dto.bracketSlot !== undefined) {
        data.bracketSlot = dto.bracketSlot;
      }
      if (dto.entryAId !== undefined) {
        data.entryA = dto.entryAId ? { connect: { id: dto.entryAId } } : { disconnect: true };
      }
      if (dto.entryBId !== undefined) {
        data.entryB = dto.entryBId ? { connect: { id: dto.entryBId } } : { disconnect: true };
      }
      if (dto.scheduledAt !== undefined) {
        data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      }
      if (dto.venue !== undefined) {
        data.venue = dto.venue;
      }

      const updated = await tx.match.update({
        where: { id },
        data,
        include: MatchesService.MATCH_RELATIONS_INCLUDE,
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'UPDATE',
          entityType: 'Match',
          entityId: id,
          before: match,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Rota legada DESATIVADA. A mudança de status de partida é feita exclusivamente pelo pipeline
   * canônico `POST /editions/:id/actions` (`match/start`, `match/finish`, ...), que roda dentro de
   * uma transação Serializable com advisory lock por edição, com retry, e que é o único caminho
   * que recalcula `phase_standings` via `EditionActionRecalculationService.recomputeTournament`.
   *
   * O `LegacyMutationGuard` (APP_GUARD) já devolve 410 para `PATCH /matches/:id/status`, mas ele é
   * global e removível. Esta barreira existe no serviço para que, num cutover faseado, a remoção do
   * guard NÃO ressuscite um escritor de partidas que encerra o jogo sem recalcular a classificação,
   * sem progredir o mata-mata, sem incrementar `edition.revision` e sem publicar a revisão no SSE.
   *
   * NÃO reative este método sem antes fazê-lo delegar ao pipeline canônico de ações (lock por
   * edição + isolamento Serializable + retry + receipt de idempotência + revisão/SSE).
   *
   * @throws GoneException sempre.
   */
  updateMatchStatus(_id: string, _status: MatchStatus, _staffId: string): Promise<never> {
    throw new GoneException(
      'Esta rota de mutação foi descontinuada. Use o endpoint canônico de ações da edição.',
    );
  }
}
