import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAthleteDto {
  @IsString({ message: 'O nome do atleta deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome do atleta é obrigatório.' })
  name!: string;

  @IsString({ message: 'O documento do atleta deve ser uma string.' })
  @IsNotEmpty({ message: 'O documento do atleta é obrigatório.' })
  document!: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'A data de nascimento deve ser uma data válida no formato YYYY-MM-DD.' },
  )
  birthDate?: string;

  @IsOptional()
  @IsEmail({}, { message: 'O e-mail deve ser um endereço de e-mail válido.' })
  email?: string;
}
