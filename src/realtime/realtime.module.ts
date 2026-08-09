import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { RealtimeEventHandlerService } from './realtime-event-handler.service';

@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeEventHandlerService],
})
export class RealtimeModule {}
