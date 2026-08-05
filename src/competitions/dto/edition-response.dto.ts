import { EditionStatus } from '@prisma/client';

export class EditionResponseDto {
  id!: string;
  competitionId!: string;
  year!: number;
  name!: string;
  startDate!: Date;
  endDate!: Date;
  status!: EditionStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
