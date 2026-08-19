export class AthleteResponseDto {
  id!: string;
  name!: string;
  document!: string | null;
  birthDate!: Date | null;
  email!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
