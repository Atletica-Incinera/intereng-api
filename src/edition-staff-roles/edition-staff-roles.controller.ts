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
import { EditionStaffRolesService } from './edition-staff-roles.service';
import { CreateEditionStaffRoleDto } from './dto/create-edition-staff-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toStaffRoleResponseDto } from './edition-staff-roles.mapper';

/**
 * Controller handling HTTP requests for Edition Staff Roles.
 * Manages operations regarding administrative assignments in competition editions.
 */
@Controller()
export class EditionStaffRolesController {
  constructor(private readonly service: EditionStaffRolesService) {}

  /**
   * Retrieves all staff roles assigned within a competition edition.
   * Restricted to EDITION_ADMIN staff members of this edition.
   *
   * @param editionId Unique identifier of the competition edition
   * @returns Wrap object containing an array of matched staff roles
   */
  @Get('editions/:editionId/staff-roles')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  async findEditionStaffRoles(@Param('editionId') editionId: string) {
    const roles = await this.service.findEditionStaffRoles(editionId);
    return {
      data: roles.map(toStaffRoleResponseDto),
    };
  }

  /**
   * Assigns a staff role to a member in a specific competition edition.
   * Restricted to at least EDITION_ADMIN. Specific conditional checks are performed in the service.
   *
   * @param editionId Unique identifier of the competition edition
   * @param dto Create DTO containing staffId, role, and disciplineId
   * @param user The authenticated user performing the operation
   * @returns The created staff role entry mapped to the standard response DTO
   */
  @Post('editions/:editionId/staff-roles')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.CREATED)
  async createEditionStaffRole(
    @Param('editionId') editionId: string,
    @Body() dto: CreateEditionStaffRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = await this.service.createEditionStaffRole(editionId, dto, user);
    return toStaffRoleResponseDto(role);
  }

  /**
   * Revokes a staff role assignment from a competition edition.
   * Restricted to at least EDITION_ADMIN. Specific conditional checks are performed in the service.
   *
   * @param editionId Unique identifier of the competition edition
   * @param id Unique identifier of the staff role record to delete
   * @param user The authenticated user performing the operation
   */
  @Delete('editions/:editionId/staff-roles/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEditionStaffRole(
    @Param('editionId') editionId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteEditionStaffRole(editionId, id, user);
  }
}
