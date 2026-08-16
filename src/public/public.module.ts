import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { SingleFlightService } from './single-flight.service';
import { PublicCacheListener } from './public-cache.listener';

@Module({
  controllers: [PublicController],
  providers: [PublicService, SingleFlightService, PublicCacheListener],
})
export class PublicModule {}
