import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EditionSnapshotsModule } from '../edition-snapshots/edition-snapshots.module';
import { EditionActionRecalculationService } from './edition-action-recalculation.service';
import { EditionActionsController } from './edition-actions.controller';
import { EditionActionsService } from './edition-actions.service';
import { CatalogActionHandler } from './handlers/catalog-action.handler';
import { CategoryActionHandler } from './handlers/category-action.handler';
import { ContextActionHandler } from './handlers/context-action.handler';
import { MatchActionHandler } from './handlers/match-action.handler';
import { RankingActionHandler } from './handlers/ranking-action.handler';
import { UploadsModule } from '../uploads/uploads.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [AuthModule, EditionSnapshotsModule, UploadsModule, RealtimeModule],
  controllers: [EditionActionsController],
  providers: [
    EditionActionsService,
    EditionActionRecalculationService,
    MatchActionHandler,
    CategoryActionHandler,
    CatalogActionHandler,
    RankingActionHandler,
    ContextActionHandler,
  ],
})
export class EditionActionsModule {}
