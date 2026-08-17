import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';

@Controller()
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get('editions/:editionId/live')
  async getLiveMatches(@Param('editionId') editionId: string) {
    const data = await this.service.getLiveMatches(editionId);
    return data;
  }

  @Get('editions/:editionId/schedule')
  async getSchedule(@Param('editionId') editionId: string, @Query('date') date: string) {
    const data = await this.service.getSchedule(editionId, date);
    return data;
  }

  @Get('tournaments/:id/bracket')
  async getBracket(@Param('id') tournamentId: string) {
    const data = await this.service.getBracket(tournamentId);
    return data;
  }
}
