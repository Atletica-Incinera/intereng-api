import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { UpdateEditionStatusDto } from './dto/update-edition-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { toEditionResponseDto } from './competitions.mapper';

@Controller('editions')
export class EditionsController {
  constructor(private readonly service: CompetitionsService) {}

  @Get(':editionId')
  async findOne(@Param('editionId') editionId: string) {
    const edition = await this.service.findEditionById(editionId);
    return toEditionResponseDto(edition);
  }

  @Patch(':editionId')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  async update(@Param('editionId') editionId: string, @Body() dto: UpdateEditionDto) {
    const updated = await this.service.updateEdition(editionId, dto);
    return toEditionResponseDto(updated);
  }

  @Patch(':editionId/status')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.EDITION_ADMIN)
  @ScopeParam('editionId', 'edition')
  async updateStatus(@Param('editionId') editionId: string, @Body() dto: UpdateEditionStatusDto) {
    const updated = await this.service.updateEditionStatus(editionId, dto.status);
    return toEditionResponseDto(updated);
  }
}
