import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { RealtimeEventHandlerService } from './realtime-event-handler.service';
import { EditionRealtimeController } from './edition-realtime.controller';
import { EditionSnapshotsModule } from '../edition-snapshots/edition-snapshots.module';

@Module({
  imports: [EditionSnapshotsModule],
  controllers: [RealtimeController, EditionRealtimeController],
  providers: [RealtimeService, RealtimeEventHandlerService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
