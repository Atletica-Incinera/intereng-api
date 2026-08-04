import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FutsalHandebolEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minute: number;
}
