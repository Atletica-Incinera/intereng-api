import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGroupEntryDto {
  @IsString()
  @IsNotEmpty()
  entryId: string;
}
