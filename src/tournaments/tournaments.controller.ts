import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { UpdateTournamentStatusDto } from './dto/update-tournament-status.dto';
import { TournamentQueryDto } from './dto/tournament-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toTournamentResponseDto } from './tournaments.mapper';

@Controller()
export class TournamentsController {
  constructor(private readonly service: TournamentsService) {}

  /**
   * Retrieves all tournaments for a given competition edition.
   * Can be filtered by status and/or discipline via query parameters.
   */
  @Get('editions/:editionId/tournaments')
  async findAll(@Param('editionId') editionId: string, @Query() query: TournamentQueryDto) {
    const tournaments = await this.service.findAllTournaments(editionId, query);
    return tournaments.map(toTournamentResponseDto);
  }

  /**
   * Retrieves a single tournament by its ID.
   */
  @Get('tournaments/:id')
  async findOne(@Param('id') id: string) {
    const tournament = await this.service.findTournamentById(id);
    return toTournamentResponseDto(tournament);
  }

  /**
   * Creates a new tournament in a specific competition edition.
   */
  @Post('editions/:editionId/tournaments')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('editionId') editionId: string,
    @Body() dto: CreateTournamentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tournament = await this.service.createTournament(editionId, dto, user.id);
    return toTournamentResponseDto(tournament);
  }

  /**
   * Updates a tournament's details.
   */
  @Patch('tournaments/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'tournament')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tournament = await this.service.updateTournament(id, dto, user.id);
    return toTournamentResponseDto(tournament);
  }

  /**
   * Updates a tournament's status.
   */
  @Patch('tournaments/:id/status')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'tournament')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tournament = await this.service.updateTournamentStatus(id, dto.status, user.id);
    return toTournamentResponseDto(tournament);
  }
}
