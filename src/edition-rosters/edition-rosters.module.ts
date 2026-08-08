import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EditionRostersController } from './edition-rosters.controller';
import { EditionRostersService } from './edition-rosters.service';

@Module({
  imports: [AuthModule],
  controllers: [EditionRostersController],
  providers: [EditionRostersService],
  exports: [EditionRostersService],
})
export class EditionRostersModule {}
