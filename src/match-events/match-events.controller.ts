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
import { MatchEventsService } from './match-events.service';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { toMatchEventResponseDto } from './match-events.mapper';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthorizationGuard } from '../common/guards/authorization.guard';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { ScopeParam } from '../common/decorators/scope-param.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('matches/:matchId/events')
export class MatchEventsController {
  constructor(private readonly service: MatchEventsService) {}

  @Get()
  async findAll(@Param('matchId') matchId: string) {
    const events = await this.service.findEventsForMatch(matchId);
    return events.map(toMatchEventResponseDto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('matchId', 'match')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('matchId') matchId: string,
    @Body() dto: CreateMatchEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const event = await this.service.createEvent(matchId, dto, user.id);
    return toMatchEventResponseDto(event);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AuthorizationGuard)
  @RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)
  @ScopeParam('matchId', 'match')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('matchId') matchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteEvent(matchId, id, user.id);
  }
}
