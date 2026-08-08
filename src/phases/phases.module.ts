import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PhasesController } from './phases.controller';
import { PhasesService } from './phases.service';
import { PhaseConfigValidator } from '../common/validation/phase-config.validator';
import { PhaseType } from '@prisma/client';
import { GroupLeaguePhaseConfigDto } from '../common/validation/dtos/group-league-phase-config.dto';
import { KnockoutPhaseConfigDto } from '../common/validation/dtos/knockout-phase-config.dto';

@Module({
  imports: [AuthModule],
  controllers: [PhasesController],
  providers: [PhasesService],
  exports: [PhasesService],
})
export class PhasesModule implements OnModuleInit {
  onModuleInit() {
    PhaseConfigValidator.register(PhaseType.GROUP, GroupLeaguePhaseConfigDto);
    PhaseConfigValidator.register(PhaseType.LEAGUE, GroupLeaguePhaseConfigDto);
    PhaseConfigValidator.register(PhaseType.KNOCKOUT, KnockoutPhaseConfigDto);
  }
}
