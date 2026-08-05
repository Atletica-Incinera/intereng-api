import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DisciplinesController } from './disciplines.controller';
import { DisciplinesService } from './disciplines.service';

@Module({
  imports: [AuthModule],
  controllers: [DisciplinesController],
  providers: [DisciplinesService],
  exports: [DisciplinesService],
})
export class DisciplinesModule {}
