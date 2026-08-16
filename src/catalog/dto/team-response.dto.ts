export class TeamResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  initials!: string | null;
  responsible!: string | null;
  logoKey!: string | null;
  archived!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
