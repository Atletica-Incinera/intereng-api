import { IsOptional, IsString, IsDateString, IsNotEmpty } from 'class-validator';

export class UpdateEditionDto {
  @IsOptional()
  @IsString({ message: 'O nome da edição deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da edição não pode ser vazio.' })
  name?: string;

  @IsOptional()
  @IsDateString({}, { message: 'startDate deve ser uma data válida no formato ISO.' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data válida no formato ISO.' })
  endDate?: string;
}
