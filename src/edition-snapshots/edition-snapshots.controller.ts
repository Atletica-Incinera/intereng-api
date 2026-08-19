import { Controller, Get, Headers, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SnapshotEnvelopeDto } from './dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from './edition-snapshots.service';
import {
  parseEditionDisciplineHeader,
  parseEditionRoleHeader,
  parseOperatorHeader,
} from './edition-request-headers';
import { respondWithSnapshot } from './snapshot-http';

@Controller('editions')
export class EditionSnapshotsController {
  constructor(private readonly editionSnapshotsService: EditionSnapshotsService) {}

  @Get(':editionId/snapshot')
  @UseGuards(JwtAuthGuard)
  async getPrivateSnapshot(
    @Param('editionId') editionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-edition-role') editionRoleHeader: string | undefined,
    @Headers('x-edition-discipline-id') editionDisciplineHeader: string | undefined,
    @Headers('x-operator-id') operatorHeader: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto | undefined> {
    const editionRole = parseEditionRoleHeader(editionRoleHeader);
    const editionDisciplineId = parseEditionDisciplineHeader(editionDisciplineHeader);
    const operatorDeviceId = parseOperatorHeader(operatorHeader);
    const result = await this.editionSnapshotsService.getPrivateSnapshot(
      editionId,
      user,
      editionRole,
      editionDisciplineId,
      operatorDeviceId,
    );
    response.setHeader(
      'Vary',
      'Authorization, X-Edition-Role, X-Edition-Discipline-Id, X-Operator-Id',
    );
    return respondWithSnapshot(response, ifNoneMatch, result, 'private, no-cache');
  }
}
