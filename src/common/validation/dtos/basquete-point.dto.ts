import { IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BasquetePointDto {
  @Type(() => Number)
  @IsIn([1, 2, 3])
  points: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quarter: number;
}
