import { IsOptional, IsEnum, IsString } from 'class-validator';
import { TournamentStatus } from '@prisma/client';

export class TournamentQueryDto {
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @IsOptional()
  @IsString()
  disciplineId?: string;
}
