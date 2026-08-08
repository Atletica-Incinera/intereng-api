import { IsEnum, IsNotEmpty } from 'class-validator';
import { TournamentStatus } from '@prisma/client';

export class UpdateTournamentStatusDto {
  @IsEnum(TournamentStatus)
  @IsNotEmpty()
  status: TournamentStatus;
}
