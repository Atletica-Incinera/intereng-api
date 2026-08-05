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
import { DisciplinesService } from './disciplines.service';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { CreateEditionDisciplineDto } from './dto/create-edition-discipline.dto';
import { UpdateEditionDisciplineDto } from './dto/update-edition-discipline.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { toDisciplineResponseDto, toEditionDisciplineResponseDto } from './disciplines.mapper';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller()
export class DisciplinesController {
  constructor(private readonly service: DisciplinesService) {}

  @Get('disciplines')
  async findAll(@Query() query: PaginationQueryDto) {
    const paginated = await this.service.findAllDisciplines(query);
    return {
      items: paginated.items.map(toDisciplineResponseDto),
      meta: paginated.meta,
    };
  }

  @Post('disciplines')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDisciplineDto, @CurrentUser() user: AuthenticatedUser) {
    const discipline = await this.service.createDiscipline(dto, user.id, user.isSuperAdmin);
    return toDisciplineResponseDto(discipline);
  }

  @Get('editions/:editionId/disciplines')
  async findEditionDisciplines(@Param('editionId') editionId: string) {
    const items = await this.service.findEditionDisciplines(editionId);
    return {
      data: items.map(toEditionDisciplineResponseDto),
    };
  }

  @Post('editions/:editionId/disciplines')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.CREATED)
  async associateDiscipline(
    @Param('editionId') editionId: string,
    @Body() dto: CreateEditionDisciplineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const association = await this.service.associateDiscipline(editionId, dto, user.id);
    return toEditionDisciplineResponseDto(association);
  }

  @Patch('editions/:editionId/disciplines/:id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('id', 'editionDiscipline')
  async updateEditionDiscipline(
    @Param('editionId') editionId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEditionDisciplineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.service.updateEditionDiscipline(editionId, id, dto, user.id);
    return toEditionDisciplineResponseDto(updated);
  }

  @Delete('editions/:editionId/disciplines/:disciplineId')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEditionDiscipline(
    @Param('editionId') editionId: string,
    @Param('disciplineId') disciplineId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteEditionDiscipline(editionId, disciplineId, user.id);
  }
}
