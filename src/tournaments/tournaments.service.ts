import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentQueryDto } from './dto/tournament-query.dto';
import { TournamentWithRelations } from './tournaments.mapper';
import { TournamentStatus } from '@prisma/client';

const TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  [TournamentStatus.DRAFT]: [TournamentStatus.SCHEDULED, TournamentStatus.CANCELLED],
  [TournamentStatus.SCHEDULED]: [
    TournamentStatus.DRAFT,
    TournamentStatus.ONGOING,
    TournamentStatus.CANCELLED,
  ],
  [TournamentStatus.ONGOING]: [TournamentStatus.FINISHED, TournamentStatus.CANCELLED],
  [TournamentStatus.FINISHED]: [],
  [TournamentStatus.CANCELLED]: [],
};

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to verify if a competition edition exists.
   *
   * @param editionId Unique identifier of the competition edition
   * @throws NotFoundException If the edition does not exist
   */
  private async verifyEditionExists(editionId: string): Promise<void> {
    const edition = await this.prisma.competitionEdition.findUnique({
      where: { id: editionId },
    });
    if (!edition) {
      throw new NotFoundException(`Edição com ID "${editionId}" não encontrada.`);
    }
  }

  /**
   * Lists all tournaments for a given edition, optionally filtered by status and disciplineId.
   *
   * @param editionId Unique identifier of the competition edition
   * @param query Query filters containing status and/or discipline ID
   * @returns A list of tournaments matching the query parameters with their associated editionDiscipline relation
   * @throws NotFoundException If the edition does not exist
   */
  async findAllTournaments(
    editionId: string,
    query: TournamentQueryDto,
  ): Promise<TournamentWithRelations[]> {
    await this.verifyEditionExists(editionId);

    return this.prisma.tournament.findMany({
      where: {
        editionDiscipline: {
          editionId,
          disciplineId: query.disciplineId || undefined,
        },
        status: query.status || undefined,
      },
      include: {
        editionDiscipline: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Finds a tournament by its unique ID.
   *
   * @param id Unique identifier of the tournament
   * @returns The tournament details with its associated editionDiscipline relation
   * @throws NotFoundException If the tournament does not exist
   */
  async findTournamentById(id: string): Promise<TournamentWithRelations> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        editionDiscipline: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException(`Torneio com ID "${id}" não encontrado.`);
    }
    return tournament;
  }

  /**
   * Helper to verify if a tournament name is unique within a specific competition edition and discipline relation.
   *
   * @param editionDisciplineId Unique identifier of the relation between the edition and discipline
   * @param name Tournament name to be checked for uniqueness
   * @throws ConflictException If a tournament with the same name already exists in the same edition and discipline
   */
  private async verifyTournamentNameUniqueness(
    editionDisciplineId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.prisma.tournament.findUnique({
      where: {
        editionDisciplineId_name: {
          editionDisciplineId,
          name,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Já existe um torneio com o nome "${name}" para esta modalidade nesta edição.`,
      );
    }
  }

  /**
   * Creates a tournament for a given competition edition and discipline.
   *
   * @param editionId Unique identifier of the competition edition
   * @param dto Data Transfer Object containing the discipline ID, name, and format of the tournament
   * @param staffId Unique identifier of the staff member performing the creation
   * @returns The created tournament with its associated editionDiscipline relation
   * @throws NotFoundException If the edition, discipline, or their association does not exist
   * @throws ConflictException If a tournament with the same name already exists for the discipline in the edition
   */
  async createTournament(
    editionId: string,
    dto: CreateTournamentDto,
    staffId: string,
  ): Promise<TournamentWithRelations> {
    await this.verifyEditionExists(editionId);

    // Verify if discipline exists
    const discipline = await this.prisma.discipline.findUnique({
      where: { id: dto.disciplineId },
    });
    if (!discipline) {
      throw new NotFoundException(`Modalidade com ID "${dto.disciplineId}" não encontrada.`);
    }

    // Verify if association exists between edition and discipline
    const editionDiscipline = await this.prisma.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: {
          editionId,
          disciplineId: dto.disciplineId,
        },
      },
    });
    if (!editionDiscipline) {
      throw new NotFoundException(
        `Modalidade com ID "${dto.disciplineId}" não está associada à edição "${editionId}".`,
      );
    }

    // Verify uniqueness: name must be unique within the same editionDiscipline
    await this.verifyTournamentNameUniqueness(editionDiscipline.id, dto.name);

    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          editionDisciplineId: editionDiscipline.id,
          name: dto.name,
          format: dto.format,
          status: TournamentStatus.DRAFT,
        },
        include: {
          editionDiscipline: true,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'Tournament',
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
   * Updates a tournament's details (name, format).
   *
   * @param id Unique identifier of the tournament to be updated
   * @param dto Data Transfer Object containing the updated name and/or format
   * @param staffId Unique identifier of the staff member performing the update
   * @returns The updated tournament with its associated editionDiscipline relation
   * @throws NotFoundException If the tournament does not exist
   * @throws ConflictException If the updated name already exists for the discipline in the edition
   */
  async updateTournament(
    id: string,
    dto: UpdateTournamentDto,
    staffId: string,
  ): Promise<TournamentWithRelations> {
    const tournament = await this.findTournamentById(id);

    if (dto.name && dto.name !== tournament.name) {
      await this.verifyTournamentNameUniqueness(tournament.editionDisciplineId, dto.name);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.update({
        where: { id },
        data: {
          name: dto.name,
          format: dto.format,
        },
        include: {
          editionDiscipline: true,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: tournament.editionDiscipline.editionId,
          action: 'UPDATE',
          entityType: 'Tournament',
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
   * Updates a tournament's status using state machine validations.
   *
   * @param id Unique identifier of the tournament whose status is being updated
   * @param newStatus The target TournamentStatus state
   * @param staffId Unique identifier of the staff member performing the status update
   * @returns The updated tournament with its associated editionDiscipline relation
   * @throws NotFoundException If the tournament does not exist
   * @throws BadRequestException If the status transition is invalid according to the state machine rules
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

    const allowedTransitions = TOURNAMENT_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: não é permitido mudar de "${currentStatus}" para "${newStatus}".`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tournament.update({
        where: { id },
        data: {
          status: newStatus,
        },
        include: {
          editionDiscipline: true,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: tournament.editionDiscipline.editionId,
          action: 'UPDATE',
          entityType: 'Tournament',
          entityId: id,
          before: tournament,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }
}
