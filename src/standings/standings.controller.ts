import { Controller, Get, Param } from '@nestjs/common';
import { StandingsService } from './standings.service';
import { toStandingResponseDto } from './standings.mapper';

@Controller('phases')
export class StandingsController {
  constructor(private readonly service: StandingsService) {}

  /**
   * Retrieves the standings for a specific phase, ordered by rank.
   * Public route.
   */
  @Get(':phaseId/standings')
  async getStandings(@Param('phaseId') phaseId: string) {
    const standings = await this.service.getStandings(phaseId);
    return standings.map(toStandingResponseDto);
  }
}
