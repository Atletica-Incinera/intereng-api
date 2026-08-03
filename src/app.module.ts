import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { DisciplinesModule } from './disciplines/disciplines.module';
import { CatalogModule } from './catalog/catalog.module';
import { EditionRostersModule } from './edition-rosters/edition-rosters.module';
import { EditionStaffRolesModule } from './edition-staff-roles/edition-staff-roles.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { PhasesModule } from './phases/phases.module';
import { TournamentEntriesModule } from './tournament-entries/tournament-entries.module';
import { MatchesModule } from './matches/matches.module';
import { MatchEventsModule } from './match-events/match-events.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StandingsModule } from './standings/standings.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { PublicModule } from './public/public.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    AuthModule,
    CompetitionsModule,
    DisciplinesModule,
    CatalogModule,
    EditionRostersModule,
    EditionStaffRolesModule,
    TournamentsModule,
    PhasesModule,
    TournamentEntriesModule,
    MatchesModule,
    MatchEventsModule,
    RealtimeModule,
    StandingsModule,
    AuditLogsModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
