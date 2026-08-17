import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentQueryDto } from './dto/tournament-query.dto';
import { TournamentWithRelations } from './tournaments.mapper';
import { TournamentStatus } from '@prisma/client';
import { TournamentValidatorService } from './tournament-validator.service';
import { AuditHelperService } from '../common/audit/audit-helper.service';
import { TournamentStatusService } from './tournament-status.service';

/**
 * Service for managing tournaments within competition editions.
 * Provides CRUD operations with validation and audit logging.
 */
@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly validator: TournamentValidatorService,
    private readonly statusService: TournamentStatusService,
    private readonly auditHelper: AuditHelperService,
  ) {}

  /**
   * Lists all tournaments for a given edition, optionally filtered by status and disciplineId.
   */
  async findAllTournaments(
    editionId: string,
    query: TournamentQueryDto,
  ): Promise<TournamentWithRelations[]> {
    await this.validator.verifyEditionExists(editionId);

    return this.prisma.tournament.findMany({
      where: {
        editionDiscipline: {
          editionId,
          disciplineId: query.disciplineId || undefined,
        },
        status: query.status || undefined,
      },
      include: { editionDiscipline: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a tournament by its unique ID.
   */
  async findTournamentById(id: string): Promise<TournamentWithRelations> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { editionDiscipline: true },
    });
    if (!tournament) {
      throw new NotFoundException(`Torneio com ID "${id}" não encontrado.`);
    }
    return tournament;
  }

  /**
   * Creates a tournament for a given competition edition and discipline.
   */
  async createTournament(
    editionId: string,
    dto: CreateTournamentDto,
    staffId: string,
  ): Promise<TournamentWithRelations> {
    await this.validator.verifyEditionExists(editionId);

    // Verify discipline existence
    const discipline = await this.prisma.discipline.findUnique({
      where: { id: dto.disciplineId },
    });
    if (!discipline) {
      throw new NotFoundException(`Modalidade com ID "${dto.disciplineId}" não encontrada.`);
    }

    // Verify edition-discipline association
    const editionDiscipline = await this.prisma.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: { editionId, disciplineId: dto.disciplineId },
      },
    });
    if (!editionDiscipline) {
      throw new NotFoundException(
        `Modalidade com ID "${dto.disciplineId}" não está associada à edição "${editionId}".`,
      );
    }

    // Verify name uniqueness
    await this.validator.verifyTournamentNameUniqueness(editionDiscipline.id, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          editionDisciplineId: editionDiscipline.id,
          name: dto.name,
          format: dto.format,
          status: TournamentStatus.DRAFT,
        },
        include: { editionDiscipline: true },
      });

      await this._recordAudit(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityId: tournament.id,
          before: null,
          after: tournament,
        },
        tx,
      );

      return tournament;
    });
  }

  /**
   * Updates tournament details.
   */
  async updateTournament(
    id: string,
    dto: UpdateTournamentDto,
    staffId: string,
  ): Promise<TournamentWithRelations> {
    const tournament = await this.findTournamentById(id);

    if (dto.name && dto.name !== tournament.name) {
      await this.validator.verifyTournamentNameUniqueness(tournament.editionDisciplineId, dto.name);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.update({
        where: { id },
        data: { name: dto.name, format: dto.format },
        include: { editionDiscipline: true },
      });

      await this._recordAudit(
        {
          staffId,
          editionId: tournament.editionDiscipline.editionId,
          action: 'UPDATE',
          entityId: id,
          before: tournament,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Updates tournament status with state machine validation.
   */
  async updateTournamentStatus(
    id: string,
    newStatus: TournamentStatus,
    staffId: string,
  ): Promise<TournamentWithRelations> {
    const tournament = await this.findTournamentById(id);
    const currentStatus = tournament.status;

    if (currentStatus === newStatus) {
      return tournament;
    }

    const allowedTransitions = this.statusService.getAllowedTransitions(currentStatus);
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: não é permitido mudar de "${currentStatus}" para "${newStatus}".`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.update({
        where: { id },
        data: { status: newStatus },
        include: { editionDiscipline: true },
      });

      await this._recordAudit(
        {
          staffId,
          editionId: tournament.editionDiscipline.editionId,
          action: 'UPDATE',
          entityId: id,
          before: tournament,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  // Private helper for audit recording
  private async _recordAudit(
    params: {
      staffId: string;
      editionId: string;
      action: string;
      entityId: string;
      before: any;
      after: any;
    },
    tx: any,
  ) {
    await this.auditHelper.recordAudit(
      this.audit,
      {
        staffId: params.staffId,
        editionId: params.editionId,
        action: params.action,
        entityType: 'Tournament',
        entityId: params.entityId,
        before: params.before,
        after: params.after,
      },
      tx,
    );
  }
}
