import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TournamentValidatorService } from './tournament-validator.service';
import { TournamentStatusService } from './tournament-status.service';
import { AuditHelperService } from '../common/audit/audit-helper.service';

@Module({
  imports: [AuthModule],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentValidatorService,
    TournamentStatusService,
    AuditHelperService,
  ],
  exports: [TournamentsService],
})
export class TournamentsModule {}
