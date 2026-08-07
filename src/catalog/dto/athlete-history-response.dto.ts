export class AthleteHistoryItemDto {
  editionName!: string;
  disciplineName!: string;
  teamName!: string | null;
  jerseyNumber!: number | null;
  status!: string;
}

export class AthleteHistoryResponseDto {
  data!: AthleteHistoryItemDto[];
}
