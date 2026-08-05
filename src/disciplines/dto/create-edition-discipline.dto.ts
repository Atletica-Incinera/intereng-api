import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEditionDisciplineDto {
  @IsString({ message: 'O ID da modalidade deve ser uma string.' })
  @IsNotEmpty({ message: 'O ID da modalidade é obrigatório.' })
  disciplineId!: string;

  @IsObject({ message: 'A configuração deve ser um objeto JSON.' })
  @IsOptional()
  config?: Record<string, any>;
}
