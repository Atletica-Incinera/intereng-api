import { EditionStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateEditionStatusDto {
  @IsEnum(EditionStatus, {
    message: `O status deve ser um dos seguintes valores: ${Object.values(EditionStatus).join(', ')}.`,
  })
  @IsNotEmpty({ message: 'O status é obrigatório.' })
  status!: EditionStatus;
}
