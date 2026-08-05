import { IsInt, IsNotEmpty, IsString, Min, Max, IsDateString } from 'class-validator';

export class CreateEditionDto {
  @IsInt({ message: 'O ano deve ser um número inteiro.' })
  @Min(1900, { message: 'O ano deve ser igual ou posterior a 1900.' })
  @Max(2100, { message: 'O ano deve ser igual ou anterior a 2100.' })
  @IsNotEmpty({ message: 'O ano é obrigatório.' })
  year!: number;

  @IsString({ message: 'O nome da edição deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da edição é obrigatório.' })
  name!: string;

  @IsDateString({}, { message: 'startDate deve ser uma data válida no formato ISO.' })
  @IsNotEmpty({ message: 'startDate é obrigatório.' })
  startDate!: string;

  @IsDateString({}, { message: 'endDate deve ser uma data válida no formato ISO.' })
  @IsNotEmpty({ message: 'endDate é obrigatório.' })
  endDate!: string;
}
