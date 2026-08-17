import { MatchEvent } from '@prisma/client';

export function toMatchEventResponseDto(event: MatchEvent) {
  return {
    id: event.id,
    matchId: event.matchId,
    entryId: event.entryId,
    athleteId: event.athleteId,
    type: event.type,
    sequence: event.sequence,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
  };
}
