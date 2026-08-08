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
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { MatchQueryDto } from './dto/match-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toMatchResponseDto } from './matches.mapper';

@Controller()
export class MatchesController {
  constructor(private readonly service: MatchesService) {}

  /**
   * Retrieves all matches for a given phase.
   * Can be filtered by status and/or round.
   * Public access.
   */
  @Get('phases/:phaseId/matches')
  async findAll(@Param('phaseId') phaseId: string, @Query() query: MatchQueryDto) {
    const matches = await this.service.findAllMatches(phaseId, query.status, query.round);
    return matches.map(toMatchResponseDto);
  }

  /**
   * Retrieves a single match by its ID.
   * Public access.
   */
  @Get('matches/:id')
  async findOne(@Param('id') id: string) {
    const match = await this.service.findMatchById(id);
    return toMatchResponseDto(match);
  }

  /**
   * Creates a new match in a specific phase.
   */
  @Post('phases/:phaseId/matches')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('phaseId', 'phase')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const match = await this.service.createMatch(phaseId, dto, user.id);
    return toMatchResponseDto(match);
  }

  /**
   * Updates an existing match's details.
   */
  @Patch('matches/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'match')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const match = await this.service.updateMatch(id, dto, user.id);
    return toMatchResponseDto(match);
  }

  /**
   * Updates a match's status.
   */
  @Patch('matches/:id/status')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'match')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMatchStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const match = await this.service.updateMatchStatus(id, dto.status, user.id);
    return toMatchResponseDto(match);
  }
}
