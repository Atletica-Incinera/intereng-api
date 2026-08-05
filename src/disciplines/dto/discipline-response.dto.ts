export class DisciplineResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  isIndividual!: boolean;
  description!: string | null;
  createdAt!: Date;
}
