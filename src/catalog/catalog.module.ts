import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { AthletesController } from './athletes.controller';
import { TeamsService } from './teams.service';
import { AthletesService } from './athletes.service';
import { CatalogSecurityService } from './catalog-security.service';
import { CanManageCatalogGuard } from './guards/can-manage-catalog.guard';
import { AthletePIIInterceptor } from './interceptors/athlete-pii.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController, AthletesController],
  providers: [
    TeamsService,
    AthletesService,
    CatalogSecurityService,
    CanManageCatalogGuard,
    AthletePIIInterceptor,
  ],
  exports: [
    TeamsService,
    AthletesService,
    CatalogSecurityService,
    CanManageCatalogGuard,
    AthletePIIInterceptor,
  ],
})
export class CatalogModule {}
