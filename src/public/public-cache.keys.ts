/**
 * Constantes e funções geradoras de chaves de cache compartilhadas entre o serviço
 * público (PublicService) e o ouvinte de eventos de cache (PublicCacheListener).
 */

export const getLiveMatchesCacheKey = (editionId: string): string => `edition:${editionId}:live`;

export const getBracketCacheKey = (tournamentId: string): string =>
  `tournament:${tournamentId}:bracket`;

export const getScheduleCacheKey = (editionId: string, date: string): string =>
  `edition:${editionId}:schedule:${date}`;

export const getScheduleWildcardCacheKey = (editionId: string): string =>
  `edition:${editionId}:schedule:*`;
