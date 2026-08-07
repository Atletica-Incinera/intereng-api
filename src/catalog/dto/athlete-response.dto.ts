export class AthleteResponseDto {
  id!: string;
  name!: string;
  document!: string;
  birthDate!: Date | null;
  email!: string | null;
  createdAt!: Date;
}
