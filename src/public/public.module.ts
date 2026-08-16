import { Module } from '@nestjs/common';
import { EditionSnapshotsModule } from '../edition-snapshots/edition-snapshots.module';
import { PublicController } from './public.controller';

@Module({
  imports: [EditionSnapshotsModule],
  controllers: [PublicController],
})
export class PublicModule {}
