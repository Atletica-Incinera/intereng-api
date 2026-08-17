export const REDIS_STREAM_PREFIX = 'stream:match:';
export const REDIS_EDITION_STREAM_PREFIX = 'stream:edition:';

/**
 * Returns the full Redis stream key for a given match ID.
 * @param matchId The unique identifier of the match.
 */
export function getStreamKey(matchId: string): string {
  return `${REDIS_STREAM_PREFIX}${matchId}`;
}

export function getEditionStreamKey(editionId: string): string {
  return `${REDIS_EDITION_STREAM_PREFIX}${editionId}`;
}
