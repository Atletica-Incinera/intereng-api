import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTeamLogoUploadUrlDto } from './dto/create-team-logo-upload-url.dto';
import { TeamLogoUploadUrlResponseDto } from './dto/team-logo-upload-url-response.dto';
import { UploadsService } from './uploads.service';

@Controller('teams')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post(':id/logo-upload-url')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  createTeamLogoUploadUrl(
    @Param('id') teamId: string,
    @Body() dto: CreateTeamLogoUploadUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeamLogoUploadUrlResponseDto> {
    return this.uploads.createTeamLogoUploadUrl(teamId, dto, user);
  }
}
