import { EditionStatus } from '@prisma/client';

export class EditionResponseDto {
  id!: string;
  competitionId!: string;
  year!: number;
  name!: string;
  startDate!: Date;
  endDate!: Date;
  status!: EditionStatus;
  isActive!: boolean;
  revision!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
