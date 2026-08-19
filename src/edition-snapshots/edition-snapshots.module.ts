import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActiveEditionResolver } from './active-edition.resolver';
import { EditionSnapshotsController } from './edition-snapshots.controller';
import { EditionSnapshotsService } from './edition-snapshots.service';
import { SnapshotMapper } from './snapshot.mapper';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [EditionSnapshotsController],
  providers: [ActiveEditionResolver, EditionSnapshotsService, SnapshotMapper],
  exports: [EditionSnapshotsService, ActiveEditionResolver],
})
export class EditionSnapshotsModule {}
