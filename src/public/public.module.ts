import { Module } from '@nestjs/common';
import { EditionSnapshotsModule } from '../edition-snapshots/edition-snapshots.module';
import { PublicCacheListener } from './public-cache.listener';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { SingleFlightService } from './single-flight.service';

@Module({
  imports: [EditionSnapshotsModule],
  controllers: [PublicController],
  providers: [PublicService, SingleFlightService, PublicCacheListener],
})
export class PublicModule {}
