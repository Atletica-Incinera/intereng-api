import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTournamentEntryDto } from '../dto/create-tournament-entry.dto';
import { EntryValidationFactory } from '../strategies/entry-validation.strategy';

@Injectable()
export class TournamentEntryValidator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Coordinates validation for registering a team or athlete in a tournament.
   *
   * @param tournamentId Unique identifier of the tournament
   * @param dto DTO with registration payload
   * @param isIndividual Format type of the discipline (true for individual, false for collective)
   * @throws BadRequestException If format constraints or payload structure constraints are violated
   * @throws NotFoundException If the team/athlete is not found
   * @throws ConflictException If the team/athlete is already registered in the tournament
   */
  async validate(
    tournamentId: string,
    dto: CreateTournamentEntryDto,
    isIndividual: boolean,
  ): Promise<void> {
    this.validatePayloadFormat(dto);

    const strategy = EntryValidationFactory.getStrategy(isIndividual);

    strategy.validateFormat(dto);
    await strategy.validateExistence(this.prisma, dto);
    await strategy.validateUniqueness(this.prisma, tournamentId, dto);
  }

  /**
   * Ensures that exactly one identifier (teamId or athleteId) is provided.
   */
  private validatePayloadFormat(dto: CreateTournamentEntryDto): void {
    const hasTeamId = dto.teamId !== undefined && dto.teamId !== null;
    const hasAthleteId = dto.athleteId !== undefined && dto.athleteId !== null;

    if ((hasTeamId && hasAthleteId) || (!hasTeamId && !hasAthleteId)) {
      throw new BadRequestException('Exatamente um entre teamId e athleteId deve ser enviado.');
    }
  }
}
