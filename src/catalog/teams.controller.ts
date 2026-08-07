import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toTeamResponseDto } from './catalog.mapper';
import { GetCatalogQueryDto } from './dto/get-catalog-query.dto';

/**
 * Controller responsible for managing teams in the global catalog.
 * Provides endpoints for creating, retrieving, and listing teams.
 */
@Controller('teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  /**
   * Creates a new team in the global catalog.
   *
   * Business Rules:
   * - Only accessible to EDITION_ADMIN or SuperAdmin users.
   * - Slugs must be unique.
   *
   * @param dto The data transfer object containing the team's details.
   * @param user The authenticated user performing the request.
   * @returns The created team mapped to a TeamResponseDto.
   * @throws ForbiddenException if the user lacks rights to manage the catalog.
   * @throws ConflictException if a team with the specified slug already exists.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTeam(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthenticatedUser) {
    const team = await this.service.createTeam(dto, user.id, user.isSuperAdmin);
    return toTeamResponseDto(team);
  }

  /**
   * Lists teams with pagination and optional search filter.
   *
   * @param query The query parameters containing pagination options and search term.
   * @returns A paginated list of teams mapped to TeamResponseDto.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAllTeams(@Query() query: GetCatalogQueryDto) {
    const paginated = await this.service.findAllTeams(query, query.search);
    return {
      items: paginated.items.map(toTeamResponseDto),
      meta: paginated.meta,
    };
  }

  /**
   * Retrieves a specific team by its unique identifier.
   *
   * @param id The unique identifier of the team.
   * @returns The requested team mapped to a TeamResponseDto.
   * @throws NotFoundException if the team does not exist.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findTeamById(@Param('id') id: string) {
    const team = await this.service.findTeamById(id);
    return toTeamResponseDto(team);
  }
}
