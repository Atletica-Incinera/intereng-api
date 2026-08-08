import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { RosterStatus } from '@prisma/client';

export class UpdateEditionRosterDto {
  @IsEnum(RosterStatus)
  @IsOptional()
  status?: RosterStatus;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  teamId?: string;
}
