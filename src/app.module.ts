import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { EditionSnapshotsModule } from './edition-snapshots/edition-snapshots.module';
import { EditionActionsModule } from './edition-actions/edition-actions.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestContextModule } from './common/request-context/request-context.module';
import { pinoLoggerConfig } from './common/logger/logger.config';
import { RedisModule } from './common/redis/redis.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from './common/config/config.module';
import { env } from './common/config/env';
import { UploadsModule } from './uploads/uploads.module';
import { LegacyMutationGuard } from './common/guards/legacy-mutation.guard';
import { AuthThrottlerGuard } from './auth/guards/auth-throttler.guard';
import { authThrottlerOptions } from './auth/guards/auth-throttler.config';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RequestContextModule,
    EventEmitterModule.forRoot({ wildcard: true }),
    LoggerModule.forRoot(pinoLoggerConfig),
    RedisModule.forRootAsync({
      useFactory: () => ({
        url: env.redisUrl,
      }),
    }),
    // Contagem em memória, de propósito: a API roda em um processo só, e um
    // armazenamento compartilhado a mais é uma dependência a mais para cair na
    // véspera do evento. Se um dia houver mais de uma instância, o limite passa
    // a valer por instância — e aí vale trocar pelo storage de Redis.
    ThrottlerModule.forRoot(authThrottlerOptions),

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
    EditionSnapshotsModule,
    EditionActionsModule,
    UploadsModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: LegacyMutationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
    },
  ],
})
export class AppModule {}
