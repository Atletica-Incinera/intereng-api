import { Controller, Get, Headers, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SnapshotEnvelopeDto } from './dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from './edition-snapshots.service';
import { respondWithSnapshot } from './snapshot-http';

@Controller('editions')
export class EditionSnapshotsController {
  constructor(private readonly editionSnapshotsService: EditionSnapshotsService) {}

  @Get(':editionId/snapshot')
  @UseGuards(JwtAuthGuard)
  async getPrivateSnapshot(
    @Param('editionId') editionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto | undefined> {
    const result = await this.editionSnapshotsService.getPrivateSnapshot(editionId, user);
    response.setHeader('Vary', 'Authorization');
    return respondWithSnapshot(response, ifNoneMatch, result, 'private, no-cache');
  }
}
