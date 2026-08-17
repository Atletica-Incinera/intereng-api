import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SnapshotEnvelopeDto } from '../edition-snapshots/dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import { respondWithSnapshot } from '../edition-snapshots/snapshot-http';
import { PublicService } from './public.service';

@Controller()
export class PublicController {
  constructor(
    private readonly editionSnapshotsService: EditionSnapshotsService,
    private readonly publicService: PublicService,
  ) {}

  @Get('editions/:editionId/public-snapshot')
  async getPublicSnapshot(
    @Param('editionId') editionId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto | undefined> {
    const result = await this.editionSnapshotsService.getPublicSnapshot(editionId);
    return respondWithSnapshot(response, ifNoneMatch, result, 'public, no-cache');
  }

  @Get('editions/:editionId/live')
  async getLiveMatches(@Param('editionId') editionId: string) {
    return this.publicService.getLiveMatches(editionId);
  }

  @Get('editions/:editionId/schedule')
  async getSchedule(@Param('editionId') editionId: string, @Query('date') date: string) {
    return this.publicService.getSchedule(editionId, date);
  }

  @Get('tournaments/:id/bracket')
  async getBracket(@Param('id') tournamentId: string) {
    return this.publicService.getBracket(tournamentId);
  }
}
