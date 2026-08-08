import { EditionStaffRoleType } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class CreateEditionStaffRoleDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsOptional()
  disciplineId?: string | null;

  @IsEnum(EditionStaffRoleType, {
    message: `Role deve ser ${Object.values(EditionStaffRoleType).join(' ou ')}`,
  })
  @IsNotEmpty()
  role: EditionStaffRoleType;
}
