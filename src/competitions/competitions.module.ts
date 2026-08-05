import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompetitionsController } from './competitions.controller';
import { EditionsController } from './editions.controller';
import { CompetitionsService } from './competitions.service';

@Module({
  imports: [AuthModule],
  controllers: [CompetitionsController, EditionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
