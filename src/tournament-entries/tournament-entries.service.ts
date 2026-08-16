import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateTournamentEntryDto } from './dto/create-tournament-entry.dto';
import { TournamentEntryWithRelations } from './tournament-entries.mapper';
import { TournamentEntryValidator } from './validators/tournament-entry.validator';

@Injectable()
export class TournamentEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly validator: TournamentEntryValidator,
  ) {}

  private async ensureEditionMembership(
    tx: Prisma.TransactionClient,
    editionId: string,
    dto: CreateTournamentEntryDto,
  ): Promise<void> {
    if (dto.teamId) {
      await tx.editionTeam.upsert({
        where: { editionId_teamId: { editionId, teamId: dto.teamId } },
        create: { editionId, teamId: dto.teamId },
        update: { archived: false },
      });
      return;
    }

    if (dto.athleteId) {
      await tx.editionAthlete.upsert({
        where: { editionId_athleteId: { editionId, athleteId: dto.athleteId } },
        create: { editionId, athleteId: dto.athleteId, teamId: null },
        update: { removed: false },
      });
      return;
    }

    throw new BadRequestException('Informe um time ou atleta pertencente à edição.');
  }

  /**
   * Retrieves all tournament entries for a given tournament.
   *
   * @param tournamentId Unique identifier of the tournament
   * @returns Array of tournament entries with team and athlete relations loaded
   * @throws NotFoundException If the tournament does not exist
   */
  async findAll(tournamentId: string): Promise<TournamentEntryWithRelations[]> {
    const tournamentExists = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournamentExists) {
      throw new NotFoundException(`Torneio com ID "${tournamentId}" não encontrado.`);
    }

    return this.prisma.tournamentEntry.findMany({
      where: { tournamentId },
      include: {
        team: true,
        athlete: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Registers a team or athlete into a tournament.
   * Validates business rules:
   * 1. Verifies that the tournament exists.
   * 2. Delegates payload format validation and registration checks to TournamentEntryValidator.
   *
   * Persists the tournament entry and registers an audit log within a database transaction.
   *
   * @param tournamentId Unique identifier of the tournament
   * @param dto DTO with data for the entry (teamId, athleteId, seed)
   * @param staffId Unique identifier of the staff member performing the request
   * @returns The newly created tournament entry with relations loaded
   * @throws NotFoundException If tournament, team, or athlete are not found
   * @throws BadRequestException If input schema constraints or discipline mode constraints are violated
   * @throws ConflictException If the team or athlete is already registered in the tournament
   */
  async create(
    tournamentId: string,
    dto: CreateTournamentEntryDto,
    staffId: string,
  ): Promise<TournamentEntryWithRelations> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        editionDiscipline: {
          include: {
            discipline: true,
          },
        },
      },
    });
    if (!tournament) {
      throw new NotFoundException(`Torneio com ID "${tournamentId}" não encontrado.`);
    }

    // Delegate format and business rule validations to validator coordinating strategies
    await this.validator.validate(
      tournamentId,
      dto,
      tournament.editionDiscipline.discipline.isIndividual,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.ensureEditionMembership(tx, tournament.editionDiscipline.editionId, dto);

      const entry = await tx.tournamentEntry.create({
        data: {
          tournamentId,
          teamId: dto.teamId || null,
          athleteId: dto.athleteId || null,
          seed: dto.seed !== undefined ? dto.seed : null,
        },
        include: {
          team: true,
          athlete: true,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: tournament.editionDiscipline.editionId,
          action: 'CREATE',
          entityType: 'TournamentEntry',
          entityId: entry.id,
          before: null,
          after: entry,
        },
        tx,
      );

      return entry;
    });
  }

  /**
   * Removes a team or athlete's entry from a tournament.
   *
   * @param tournamentId Unique identifier of the tournament
   * @param id Unique identifier of the tournament entry to delete
   * @param staffId Unique identifier of the staff member performing the request
   * @throws NotFoundException If the entry does not exist or does not belong to the specified tournament
   */
  async delete(tournamentId: string, id: string, staffId: string): Promise<void> {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id },
      include: {
        tournament: {
          include: {
            editionDiscipline: true,
          },
        },
      },
    });

    if (!entry || entry.tournamentId !== tournamentId) {
      throw new NotFoundException(`Inscrição com ID "${id}" não encontrada neste torneio.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentEntry.delete({
        where: { id },
      });

      await this.audit.record(
        {
          staffId,
          editionId: entry.tournament.editionDiscipline.editionId,
          action: 'DELETE',
          entityType: 'TournamentEntry',
          entityId: id,
          before: entry,
          after: null,
        },
        tx,
      );
    });
  }
}
