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
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateEditionDto } from './dto/create-edition.dto';
import { BootstrapCompetitionDto } from './dto/bootstrap-competition.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { toCompetitionResponseDto, toEditionResponseDto } from './competitions.mapper';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly service: CompetitionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCompetitionDto) {
    const competition = await this.service.create(dto);
    return toCompetitionResponseDto(competition);
  }

  /**
   * A única forma de sair de zero competições. `/editions/:id/actions`
   * resolve a edição "active" antes de rodar qualquer ação — inclusive
   * `competition/create` — então, sem nenhuma edição ativa, nem a ação que
   * criaria a primeira chega a executar. Fora desse pipeline de propósito.
   */
  @Post('bootstrap')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async bootstrap(@Body() dto: BootstrapCompetitionDto, @CurrentUser() user: AuthenticatedUser) {
    const edition = await this.service.bootstrap(dto, user.id);
    return toEditionResponseDto(edition);
  }

  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const paginated = await this.service.findAll(query);
    return {
      items: paginated.items.map(toCompetitionResponseDto),
      meta: paginated.meta,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const competition = await this.service.findOne(id);
    return toCompetitionResponseDto(competition);
  }

  @Post(':id/editions')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createEdition(@Param('id') id: string, @Body() dto: CreateEditionDto) {
    const edition = await this.service.createEdition(id, dto);
    return toEditionResponseDto(edition);
  }

  @Get(':id/editions')
  async findEditions(@Param('id') id: string) {
    const editions = await this.service.findEditionsByCompetitionId(id);
    return editions.map(toEditionResponseDto);
  }
}
