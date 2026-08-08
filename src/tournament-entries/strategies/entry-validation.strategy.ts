import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTournamentEntryDto } from '../dto/create-tournament-entry.dto';
import { validateEntityExists, validateEntityUniqueness } from './validation-helpers';

export interface EntryValidationStrategy {
  validateFormat(dto: CreateTournamentEntryDto): void;
  validateExistence(prisma: PrismaService, dto: CreateTournamentEntryDto): Promise<void>;
  validateUniqueness(
    prisma: PrismaService,
    tournamentId: string,
    dto: CreateTournamentEntryDto,
  ): Promise<void>;
}

export class IndividualEntryStrategy implements EntryValidationStrategy {
  validateFormat(dto: CreateTournamentEntryDto): void {
    if (!dto.athleteId) {
      throw new BadRequestException(
        'Esta modalidade é individual. Apenas athleteId deve ser fornecido.',
      );
    }
  }

  async validateExistence(prisma: PrismaService, dto: CreateTournamentEntryDto): Promise<void> {
    const athleteId = dto.athleteId!;
    await validateEntityExists(
      () => prisma.athlete.findUnique({ where: { id: athleteId } }),
      `Atleta com ID "${athleteId}" não encontrado.`,
    );
  }

  async validateUniqueness(
    prisma: PrismaService,
    tournamentId: string,
    dto: CreateTournamentEntryDto,
  ): Promise<void> {
    const athleteId = dto.athleteId!;
    await validateEntityUniqueness(
      () =>
        prisma.tournamentEntry.findUnique({
          where: {
            tournamentId_athleteId: {
              tournamentId,
              athleteId,
            },
          },
        }),
      `O atleta com ID "${athleteId}" já está inscrito neste torneio.`,
    );
  }
}

export class CollectiveEntryStrategy implements EntryValidationStrategy {
  validateFormat(dto: CreateTournamentEntryDto): void {
    if (!dto.teamId) {
      throw new BadRequestException(
        'Esta modalidade é coletiva. Apenas teamId deve ser fornecido.',
      );
    }
  }

  async validateExistence(prisma: PrismaService, dto: CreateTournamentEntryDto): Promise<void> {
    const teamId = dto.teamId!;
    await validateEntityExists(
      () => prisma.team.findUnique({ where: { id: teamId } }),
      `Time com ID "${teamId}" não encontrado.`,
    );
  }

  async validateUniqueness(
    prisma: PrismaService,
    tournamentId: string,
    dto: CreateTournamentEntryDto,
  ): Promise<void> {
    const teamId = dto.teamId!;
    await validateEntityUniqueness(
      () =>
        prisma.tournamentEntry.findUnique({
          where: {
            tournamentId_teamId: {
              tournamentId,
              teamId,
            },
          },
        }),
      `O time com ID "${teamId}" já está inscrito neste torneio.`,
    );
  }
}

export class EntryValidationFactory {
  static getStrategy(isIndividual: boolean): EntryValidationStrategy {
    if (isIndividual) {
      return new IndividualEntryStrategy();
    }
    return new CollectiveEntryStrategy();
  }
}
