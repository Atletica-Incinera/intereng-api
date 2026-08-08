import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateEditionRosterDto } from './dto/create-edition-roster.dto';
import { UpdateEditionRosterDto } from './dto/update-edition-roster.dto';
import { EditionRosterQueryDto } from './dto/edition-roster-query.dto';
import { EditionRosterWithRelations } from './edition-rosters.mapper';

/**
 * Service handling business logic for edition rosters.
 * Manages the enrollment of athletes in disciplines within a specific edition.
 */
@Injectable()
export class EditionRostersService {
  /**
   * Shared relations mapping for Prisma queries on EditionRoster.
   * Prevents duplication across multiple fetch, create, and update operations (DRY compliance).
   */
  private static readonly ROSTER_INCLUDE = {
    athlete: true,
    team: true,
    editionDiscipline: {
      include: {
        edition: true,
        discipline: true,
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to verify if an edition exists.
   *
   * @param editionId Unique identifier of the competition edition
   * @throws NotFoundException If the edition does not exist in the database
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
   * Lists all rosters for a given edition, applying optional filters for discipline and team.
   *
   * @param editionId Unique identifier of the competition edition
   * @param query DTO containing filtering parameters (disciplineId, teamId)
   * @returns Array of edition roster entries with athlete, team, and discipline relations
   * @throws NotFoundException If the competition edition is not found
   */
  async findEditionRosters(
    editionId: string,
    query: EditionRosterQueryDto,
  ): Promise<EditionRosterWithRelations[]> {
    await this.verifyEditionExists(editionId);

    return this.prisma.editionRoster.findMany({
      where: {
        editionDiscipline: {
          editionId,
          disciplineId: query.disciplineId || undefined,
        },
        teamId: query.teamId || undefined,
      },
      include: EditionRostersService.ROSTER_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Enrolls an athlete in a discipline for the specified competition edition.
   * Validates several business rules:
   * 1. Verifies that the target edition exists.
   * 2. Verifies that the discipline exists and is associated with this edition.
   * 3. Validates collective vs. individual discipline requirements:
   *    - Collective disciplines require a team (teamId must be provided).
   *    - Individual disciplines must not have a team associated (teamId must be null/omitted).
   * 4. Verifies that the athlete exists.
   * 5. Enforces uniqueness: an athlete cannot be enrolled in the same discipline more than once per edition.
   *
   * Persists the roster entry and registers an audit log within a database transaction.
   *
   * @param editionId Unique identifier of the competition edition
   * @param dto DTO with data for roster enrollment (disciplineId, athleteId, teamId, jerseyNumber)
   * @param staffId Unique identifier of the staff member performing the request
   * @returns The newly created edition roster entry with relations loaded
   * @throws NotFoundException If edition, discipline, team (if collective), or athlete are not found
   * @throws BadRequestException If teamId is mismatching the discipline type (collective/individual)
   * @throws ConflictException If the athlete is already enrolled in the same discipline for this edition
   */
  async createEditionRoster(
    editionId: string,
    dto: CreateEditionRosterDto,
    staffId: string,
  ): Promise<EditionRosterWithRelations> {
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

    // Verify if team exists (required for both individual and collective disciplines)
    if (!dto.teamId) {
      throw new BadRequestException('A inscrição exige um time associado.');
    }
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException(`Time com ID "${dto.teamId}" não encontrado.`);
    }

    // Verify if athlete exists
    const athlete = await this.prisma.athlete.findUnique({
      where: { id: dto.athleteId },
    });
    if (!athlete) {
      throw new NotFoundException(`Atleta com ID "${dto.athleteId}" não encontrado.`);
    }

    // Verify if athlete is already enrolled in this discipline for this edition
    const existingRoster = await this.prisma.editionRoster.findUnique({
      where: {
        editionDisciplineId_athleteId: {
          editionDisciplineId: editionDiscipline.id,
          athleteId: dto.athleteId,
        },
      },
    });
    if (existingRoster) {
      throw new ConflictException(
        `O atleta "${athlete.name}" já possui inscrição na modalidade "${discipline.name}" nesta edição.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const roster = await tx.editionRoster.create({
        data: {
          editionDisciplineId: editionDiscipline.id,
          athleteId: dto.athleteId,
          teamId: dto.teamId || null,
          jerseyNumber: dto.jerseyNumber || null,
        },
        include: EditionRostersService.ROSTER_INCLUDE,
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'EditionRoster',
          entityId: roster.id,
          before: null,
          after: roster,
        },
        tx,
      );

      return roster;
    });
  }

  /**
   * Updates the approval/homologation status or team association of an edition roster.
   * Performs the update and logs the audit trail (before and after state) atomically.
   *
   * @param id Unique identifier of the edition roster entry
   * @param dto DTO holding the new status and/or teamId
   * @param staffId Unique identifier of the staff member updating the status
   * @returns The updated edition roster entry with relations loaded
   * @throws NotFoundException If the roster entry or target team is not found
   */
  async updateEditionRoster(
    id: string,
    dto: UpdateEditionRosterDto,
    staffId: string,
  ): Promise<EditionRosterWithRelations> {
    const roster = await this.prisma.editionRoster.findUnique({
      where: { id },
      include: EditionRostersService.ROSTER_INCLUDE,
    });

    if (!roster) {
      throw new NotFoundException(`Roster com ID "${id}" não encontrado.`);
    }

    if (dto.teamId !== undefined) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
      });
      if (!team) {
        throw new NotFoundException(`Time com ID "${dto.teamId}" não encontrado.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.editionRoster.update({
        where: { id },
        data: {
          status: dto.status,
          teamId: dto.teamId,
        },
        include: EditionRostersService.ROSTER_INCLUDE,
      });

      await this.audit.record(
        {
          staffId,
          editionId: roster.editionDiscipline.editionId,
          action: 'UPDATE',
          entityType: 'EditionRoster',
          entityId: id,
          before: roster,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Deletes an athlete's roster enrollment and logs the action for auditing.
   * Executes deletion and logs auditing atomically in a transaction.
   *
   * @param id Unique identifier of the edition roster entry to delete
   * @param staffId Unique identifier of the staff member requesting the deletion
   * @throws NotFoundException If the roster entry is not found
   */
  async deleteEditionRoster(id: string, staffId: string): Promise<void> {
    const roster = await this.prisma.editionRoster.findUnique({
      where: { id },
      include: {
        editionDiscipline: true,
      },
    });

    if (!roster) {
      throw new NotFoundException(`Roster com ID "${id}" não encontrado.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.editionRoster.delete({
        where: { id },
      });

      await this.audit.record(
        {
          staffId,
          editionId: roster.editionDiscipline.editionId,
          action: 'DELETE',
          entityType: 'EditionRoster',
          entityId: id,
          before: roster,
          after: null,
        },
        tx,
      );
    });
  }
}
