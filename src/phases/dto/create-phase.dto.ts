import { IsInt, IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { PhaseType } from '@prisma/client';

export class CreatePhaseDto {
  @IsInt()
  order: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(PhaseType)
  type: PhaseType;

  @IsOptional()
  config?: any;
}
