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
import { PhasesService } from './phases.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateGroupEntryDto } from './dto/create-group-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toPhaseResponseDto, toGroupResponseDto, toGroupEntryResponseDto } from './phases.mapper';

@Controller()
export class PhasesController {
  constructor(private readonly service: PhasesService) {}

  /**
   * Retrieves all phases for a given tournament.
   * Public access.
   */
  @Get('tournaments/:tournamentId/phases')
  async findAll(@Param('tournamentId') tournamentId: string) {
    const phases = await this.service.findAllPhases(tournamentId);
    return phases.map(toPhaseResponseDto);
  }

  /**
   * Creates a new phase within a tournament.
   */
  @Post('tournaments/:tournamentId/phases')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('tournamentId', 'tournament')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreatePhaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const phase = await this.service.createPhase(tournamentId, dto, user.id);
    return toPhaseResponseDto(phase);
  }

  /**
   * Creates a new group inside a phase.
   */
  @Post('phases/:phaseId/groups')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('phaseId', 'phase')
  @HttpCode(HttpStatus.CREATED)
  async createGroup(
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const group = await this.service.createGroup(phaseId, dto, user.id);
    return toGroupResponseDto(group);
  }

  /**
   * Allocates an entry to a group.
   */
  @Post('groups/:groupId/entries')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('groupId', 'group')
  @HttpCode(HttpStatus.CREATED)
  async createGroupEntry(
    @Param('groupId') groupId: string,
    @Body() dto: CreateGroupEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const entry = await this.service.createGroupEntry(groupId, dto, user.id);
    return toGroupEntryResponseDto(entry);
  }

  /**
   * Removes an entry from a group.
   */
  @Delete('groups/:groupId/entries/:entryId')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('groupId', 'group')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroupEntry(
    @Param('groupId') groupId: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteGroupEntry(groupId, entryId, user.id);
  }
}
