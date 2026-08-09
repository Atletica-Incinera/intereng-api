export const REDIS_STREAM_PREFIX = 'stream:match:';

/**
 * Returns the full Redis stream key for a given match ID.
 * @param matchId The unique identifier of the match.
 */
export function getStreamKey(matchId: string): string {
  return `${REDIS_STREAM_PREFIX}${matchId}`;
}
