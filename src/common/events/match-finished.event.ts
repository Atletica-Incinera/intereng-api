import { MatchStatus } from '@prisma/client';

export class MatchFinishedEvent {
  constructor(
    public readonly matchId: string,
    public readonly phaseId: string,
    public readonly scoreA: number,
    public readonly scoreB: number,
    public readonly winnerEntryId: string | null,
    public readonly status: MatchStatus = MatchStatus.FINISHED,
  ) {}
}
