import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SnapshotEnvelopeDto } from '../edition-snapshots/dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import { respondWithSnapshot } from '../edition-snapshots/snapshot-http';

@Controller('editions')
export class PublicController {
  constructor(private readonly editionSnapshotsService: EditionSnapshotsService) {}

  @Get(':editionId/public-snapshot')
  async getPublicSnapshot(
    @Param('editionId') editionId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto | undefined> {
    const result = await this.editionSnapshotsService.getPublicSnapshot(editionId);
    return respondWithSnapshot(response, ifNoneMatch, result, 'public, no-cache');
  }
}
