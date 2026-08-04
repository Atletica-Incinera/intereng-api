import { EventType } from '@prisma/client';

export class MatchEventCreatedEvent {
  constructor(
    public readonly matchId: string,
    public readonly eventId: string,
    public readonly type: EventType,
    public readonly sequence: number,
    public readonly entryId: string | null,
    public readonly athleteId: string | null,
    public readonly metadata: any,
    public readonly scoreA: number,
    public readonly scoreB: number,
  ) {}
}
