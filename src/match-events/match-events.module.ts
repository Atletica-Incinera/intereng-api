import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

@Module({
  imports: [AuthModule],
  controllers: [MatchEventsController],
  providers: [MatchEventsService],
  exports: [MatchEventsService],
})
export class MatchEventsModule {}
