import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TournamentEntriesController } from './tournament-entries.controller';
import { TournamentEntriesService } from './tournament-entries.service';
import { TournamentEntryValidator } from './validators/tournament-entry.validator';

@Module({
  imports: [AuthModule],
  controllers: [TournamentEntriesController],
  providers: [TournamentEntriesService, TournamentEntryValidator],
  exports: [TournamentEntriesService, TournamentEntryValidator],
})
export class TournamentEntriesModule {}
