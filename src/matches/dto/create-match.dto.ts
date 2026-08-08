import { IsInt, IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMatchDto {
  @IsString()
  @IsOptional()
  groupId?: string | null;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  round?: number | null;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  bracketSlot?: number | null;

  @IsString()
  @IsOptional()
  entryAId?: string | null;

  @IsString()
  @IsOptional()
  entryBId?: string | null;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string | null;

  @IsString()
  @IsOptional()
  venue?: string | null;
}
