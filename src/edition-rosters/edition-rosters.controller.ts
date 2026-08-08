import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EditionRostersService } from './edition-rosters.service';
import { CreateEditionRosterDto } from './dto/create-edition-roster.dto';
import { UpdateEditionRosterDto } from './dto/update-edition-roster.dto';
import { EditionRosterQueryDto } from './dto/edition-roster-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toRosterResponseDto } from './edition-rosters.mapper';

/**
 * Controller handling HTTP requests for Edition Rosters.
 * Manages operations regarding athlete enrollment in disciplines for specific competition editions.
 */
@Controller()
export class EditionRostersController {
  constructor(private readonly service: EditionRostersService) {}

  /**
   * Retrieves all roster entries for a given competition edition.
   * Can be filtered by discipline and/or team via query parameters.
   *
   * @param editionId Unique identifier of the competition edition (from URL path parameter)
   * @param query Filtering options containing optional disciplineId and teamId
   * @returns Wrap object containing an array of matched edition roster entries
   * @throws NotFoundException If the competition edition is not found
   */
  @Get('editions/:editionId/rosters')
  async findEditionRosters(
    @Param('editionId') editionId: string,
    @Query() query: EditionRosterQueryDto,
  ) {
    const rosters = await this.service.findEditionRosters(editionId, query);
    return {
      data: rosters.map(toRosterResponseDto),
    };
  }

  /**
   * Enrolls an athlete in a discipline for a specific competition edition.
   * Enforces business rules regarding individual vs collective disciplines and duplicates.
   * Accessible by EDITION_ADMIN and authorized DISCIPLINE_MANAGER staff.
   *
   * @param editionId Unique identifier of the competition edition (from URL path parameter)
   * @param dto Roster registration payload (athleteId, disciplineId, teamId, jerseyNumber)
   * @param user The authenticated staff member performing the registration
   * @returns The created roster record
   * @throws NotFoundException If edition, discipline, team (if collective), or athlete do not exist
   * @throws BadRequestException If teamId is invalid for the discipline mode (individual vs collective)
   * @throws ConflictException If the athlete is already registered in the same discipline for this edition
   * @throws ForbiddenException If the staff member lacks required roles or access scope
   */
  @Post('editions/:editionId/rosters')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.CREATED)
  async createEditionRoster(
    @Param('editionId') editionId: string,
    @Body() dto: CreateEditionRosterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const roster = await this.service.createEditionRoster(editionId, dto, user.id);
    return toRosterResponseDto(roster);
  }

  /**
   * Updates the status (approval, rejection, suspension) of a roster entry.
   * Accessible by EDITION_ADMIN and authorized DISCIPLINE_MANAGER staff.
   *
   * @param editionId Unique identifier of the competition edition (from URL path parameter)
   * @param id Unique identifier of the roster entry to update (from URL path parameter)
   * @param dto Payload holding the new roster status
   * @param user The authenticated staff member performing the update
   * @returns The updated roster record
   * @throws NotFoundException If the roster entry does not exist
   * @throws ForbiddenException If the staff member lacks required roles or access scope
   */
  @Patch('editions/:editionId/rosters/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'editionRoster')
  async updateEditionRoster(
    @Param('editionId') editionId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEditionRosterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.service.updateEditionRoster(id, dto, user.id);
    return toRosterResponseDto(updated);
  }

  /**
   * Deletes a roster entry (cancels athlete enrollment).
   * Restricted to EDITION_ADMIN staff only.
   *
   * @param editionId Unique identifier of the competition edition (from URL path parameter)
   * @param id Unique identifier of the roster entry to delete (from URL path parameter)
   * @param user The authenticated staff member performing the deletion
   * @throws NotFoundException If the roster entry does not exist
   * @throws ForbiddenException If the staff member lacks EDITION_ADMIN role or access scope
   */
  @Delete('editions/:editionId/rosters/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('id', 'editionRoster')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEditionRoster(
    @Param('editionId') editionId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteEditionRoster(id, user.id);
  }
}
