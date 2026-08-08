import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TournamentEntriesService } from './tournament-entries.service';
import { CreateTournamentEntryDto } from './dto/create-tournament-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toTournamentEntryResponseDto } from './tournament-entries.mapper';

@Controller()
export class TournamentEntriesController {
  constructor(private readonly service: TournamentEntriesService) {}

  /**
   * Retrieves all entries registered in a specific tournament.
   * Public endpoint.
   */
  @Get('tournaments/:tournamentId/entries')
  async findAll(@Param('tournamentId') tournamentId: string) {
    const entries = await this.service.findAll(tournamentId);
    return entries.map(toTournamentEntryResponseDto);
  }

  /**
   * Registers a new entry (team or athlete) in a tournament.
   * Protected endpoint. Requires DISCIPLINE_MANAGER or EDITION_ADMIN role.
   */
  @Post('tournaments/:tournamentId/entries')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('tournamentId', 'tournament')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTournamentEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entry = await this.service.create(tournamentId, dto, user.id);
    return toTournamentEntryResponseDto(entry);
  }

  /**
   * Removes a specific tournament entry.
   * Protected endpoint. Requires DISCIPLINE_MANAGER or EDITION_ADMIN role.
   */
  @Delete('tournaments/:tournamentId/entries/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('tournamentId', 'tournament')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('tournamentId') tournamentId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.delete(tournamentId, id, user.id);
  }
}
