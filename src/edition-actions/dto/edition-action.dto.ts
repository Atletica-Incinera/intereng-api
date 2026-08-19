import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class EditionActionAuditDto {
  @IsString({ message: 'A descrição da ação deve ser um texto.' })
  @IsNotEmpty({ message: 'A descrição da ação é obrigatória.' })
  @MaxLength(160, { message: 'A descrição da ação deve ter no máximo 160 caracteres.' })
  action!: string;

  @IsString({ message: 'A descrição da entidade deve ser um texto.' })
  @IsNotEmpty({ message: 'A descrição da entidade é obrigatória.' })
  @MaxLength(200, { message: 'A descrição da entidade deve ter no máximo 200 caracteres.' })
  entity!: string;

  @IsOptional()
  @IsString({ message: 'O estado anterior deve ser um texto.' })
  @MaxLength(2_000, { message: 'O estado anterior deve ter no máximo 2.000 caracteres.' })
  before?: string;

  @IsOptional()
  @IsString({ message: 'O estado posterior deve ser um texto.' })
  @MaxLength(2_000, { message: 'O estado posterior deve ter no máximo 2.000 caracteres.' })
  after?: string;

  @IsOptional()
  @IsString({ message: 'O motivo deve ser um texto.' })
  @MaxLength(1_000, { message: 'O motivo deve ter no máximo 1.000 caracteres.' })
  reason?: string;
}

export class EditionActionDto {
  @IsString({ message: 'O tipo da ação deve ser um texto.' })
  @IsNotEmpty({ message: 'O tipo da ação é obrigatório.' })
  @MaxLength(80, { message: 'O tipo da ação deve ter no máximo 80 caracteres.' })
  type!: string;

  @IsObject({ message: 'O payload da ação deve ser um objeto.' })
  payload!: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => EditionActionAuditDto)
  audit?: EditionActionAuditDto;
}
