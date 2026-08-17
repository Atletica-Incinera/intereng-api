import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { EventType } from '@prisma/client';

export class CreateMatchEventDto {
  @IsOptional()
  @IsString()
  entryId?: string;

  @IsOptional()
  @IsString()
  athleteId?: string;

  @IsNotEmpty()
  @IsEnum(EventType)
  type: EventType;

  @IsOptional()
  metadata?: any;
}
