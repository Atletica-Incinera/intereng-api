import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { RealtimeEventHandlerService } from './realtime-event-handler.service';
import { EditionRealtimeController } from './edition-realtime.controller';
import { SseConnectionLimiter } from './sse-connection-limiter.service';
import { AuthModule } from '../auth/auth.module';
import { EditionSnapshotsModule } from '../edition-snapshots/edition-snapshots.module';

@Module({
  // AuthModule entra por causa do `JwtAuthGuard` que fecha o canal de partidas.
  imports: [AuthModule, EditionSnapshotsModule],
  controllers: [RealtimeController, EditionRealtimeController],
  providers: [RealtimeService, RealtimeEventHandlerService, SseConnectionLimiter],
  exports: [RealtimeService],
})
export class RealtimeModule {}
