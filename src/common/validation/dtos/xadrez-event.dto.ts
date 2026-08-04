import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class XadrezEventDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  movesCount?: number;
}
