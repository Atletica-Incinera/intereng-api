import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { AthletesController } from './athletes.controller';
import { TeamsService } from './teams.service';
import { AthletesService } from './athletes.service';
import { CatalogSecurityService } from './catalog-security.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController, AthletesController],
  providers: [TeamsService, AthletesService, CatalogSecurityService],
  exports: [TeamsService, AthletesService, CatalogSecurityService],
})
export class CatalogModule {}
