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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
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
