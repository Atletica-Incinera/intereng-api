import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SnapshotEnvelopeDto } from '../edition-snapshots/dto/frontend-snapshot.dto';
import { EditionActionDto } from './dto/edition-action.dto';
import { EditionActionsService } from './edition-actions.service';

@Controller('editions')
export class EditionActionsController {
  constructor(private readonly editionActionsService: EditionActionsService) {}

  @Post(':editionId/actions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async execute(
    @Param('editionId') editionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() action: EditionActionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto> {
    const result = await this.editionActionsService.execute(
      editionId,
      idempotencyKey,
      action,
      user,
    );
    response.status(result.statusCode);
    return result.envelope;
  }
}
