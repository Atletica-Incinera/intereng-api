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
  UseInterceptors,
} from '@nestjs/common';
import { AthletesService } from './athletes.service';
import { CreateAthleteDto } from './dto/create-athlete.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { GetCatalogQueryDto } from './dto/get-catalog-query.dto';
import { toAthleteResponseDto } from './catalog.mapper';
import { CanManageCatalogGuard } from './guards/can-manage-catalog.guard';
import { AthletePIIInterceptor } from './interceptors/athlete-pii.interceptor';

/**
 * Controller responsible for managing athletes in the global catalog.
 * Provides endpoints for creating, retrieving, listing, and showing participation history for athletes.
 */
@Controller('athletes')
@UseInterceptors(AthletePIIInterceptor)
export class AthletesController {
  constructor(private readonly service: AthletesService) {}

  /**
   * Creates a new athlete in the global catalog.
   *
   * Business Rules:
   * - Only accessible to EDITION_ADMIN or SuperAdmin users.
   * - Documents must be unique.
   *
   * @param dto The data transfer object containing the athlete's details.
   * @param user The authenticated user performing the request.
   * @returns The created athlete mapped to an AthleteResponseDto.
   * @throws ForbiddenException if the user lacks rights to manage the catalog.
   * @throws ConflictException if an athlete with the same document already exists.
   */
  @Post()
  @UseGuards(JwtAuthGuard, CanManageCatalogGuard)
  @HttpCode(HttpStatus.CREATED)
  async createAthlete(@Body() dto: CreateAthleteDto, @CurrentUser() user: AuthenticatedUser) {
    const athlete = await this.service.createAthlete(dto, user.id, user.isSuperAdmin);
    return toAthleteResponseDto(athlete);
  }

  /**
   * Lists athletes with pagination and optional search filter.
   * Document PII fields are masked for non-admin users.
   *
   * @param query The query parameters containing pagination options and search term.
   * @param user The authenticated user performing the request.
   * @returns A paginated list of athletes mapped to AthleteResponseDto.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAllAthletes(@Query() query: GetCatalogQueryDto) {
    const paginated = await this.service.findAllAthletes(query, query.search);
    const items = paginated.items.map(toAthleteResponseDto);
    return {
      items,
      meta: paginated.meta,
    };
  }

  /**
   * Retrieves a specific athlete by their unique identifier.
   * The document PII field is masked if the requesting user is not an administrator.
   *
   * @param id The unique identifier of the athlete.
   * @param user The authenticated user performing the request.
   * @returns The requested athlete mapped to an AthleteResponseDto.
   * @throws NotFoundException if the athlete does not exist.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findAthleteById(@Param('id') id: string) {
    const athlete = await this.service.findAthleteById(id);
    return toAthleteResponseDto(athlete);
  }

  /**
   * Retrieves the participation history of a specific athlete across competitions and editions.
   *
   * @param id The unique identifier of the athlete.
   * @returns An object containing the list of participation history records.
   * @throws NotFoundException if the athlete does not exist.
   */
  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  async findAthleteHistory(@Param('id') id: string) {
    const history = await this.service.findAthleteHistory(id);
    return {
      data: history,
    };
  }
}
