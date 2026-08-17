import { PhaseType } from '@prisma/client';

/**
 * Resolve o nome do competidor de uma determinada inscrição (entry),
 * retornando o nome do time ou do atleta se disponível, ou null.
 *
 * @param entry Objeto que representa a inscrição no torneio (TournamentEntry)
 */
export function getEntryName(entry: any): string | null {
  if (!entry) return null;
  return entry.team?.name || entry.athlete?.name || null;
}

/**
 * Transforma uma partida do banco de dados em um DTO de campos básicos.
 *
 * @param match Objeto contendo os dados brutos da partida
 */
export function toBaseMatchDto(match: any) {
  return {
    matchId: match.id,
    tournamentName: match.phase.tournament.name,
    disciplineName: match.phase.tournament.editionDiscipline.discipline.name,
    entryA: getEntryName(match.entryA),
    entryB: getEntryName(match.entryB),
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    venue: match.venue,
  };
}

/**
 * Transforma uma partida do banco de dados em um DTO de partida ao vivo (Live Match).
 *
 * @param match Objeto contendo os dados brutos da partida
 */
export function toLiveMatchDto(match: any) {
  return toBaseMatchDto(match);
}

/**
 * Transforma uma partida do banco de dados em um DTO de agenda de partida (Scheduled Match).
 *
 * @param match Objeto contendo os dados brutos da partida
 */
export function toScheduleMatchDto(match: any) {
  return {
    ...toBaseMatchDto(match),
    status: match.status,
    scheduledAt: match.scheduledAt,
  };
}

/**
 * Transforma os dados de uma fase baseada em grupos ou pontos corridos (GROUP ou LEAGUE)
 * na estrutura pública esperada.
 *
 * @param phase Detalhes da fase (incluindo grupos e suas chaves)
 * @param phaseStandings Classificações consolidadas daquela fase específica
 */
export function toGroupPhaseDto(phase: any, phaseStandings: any[]) {
  const mappedGroups: any[] = [];

  for (const group of phase.groups) {
    const groupEntryIds = group.entries.map((ge: any) => ge.entryId);
    const groupStandings = phaseStandings
      .filter((ps) => groupEntryIds.includes(ps.entryId))
      .map((ps) => {
        const entryName = getEntryName(ps.entry) || 'Time/Atleta';
        return {
          entryId: ps.entryId,
          entryName,
          played: ps.played,
          won: ps.won,
          drawn: ps.drawn,
          lost: ps.lost,
          scoreFor: ps.scoreFor,
          scoreAgainst: ps.scoreAgainst,
          points: ps.points,
          rank: ps.rank,
        };
      });

    mappedGroups.push({
      name: group.name,
      standings: groupStandings,
    });
  }

  return {
    phaseId: phase.id,
    name: phase.name,
    type: phase.type as PhaseType,
    groups: mappedGroups,
  };
}

/**
 * Transforma os dados de uma fase eliminatória direta (KNOCKOUT)
 * na estrutura pública esperada de chaveamento de partidas.
 *
 * @param phase Detalhes da fase (incluindo a lista de partidas)
 */
export function toKnockoutPhaseDto(phase: any) {
  const mappedMatches = phase.matches.map((match: any) => {
    const entryAName = getEntryName(match.entryA);
    const entryBName = getEntryName(match.entryB);

    let winnerName: string | null = null;
    if (match.winnerEntryId) {
      if (match.entryA && match.winnerEntryId === match.entryA.id) {
        winnerName = getEntryName(match.entryA);
      } else if (match.entryB && match.winnerEntryId === match.entryB.id) {
        winnerName = getEntryName(match.entryB);
      }
    }

    return {
      round: match.round,
      bracketSlot: match.bracketSlot,
      entryA: entryAName,
      entryB: entryBName,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      winner: winnerName,
    };
  });

  return {
    phaseId: phase.id,
    name: phase.name,
    type: phase.type as PhaseType,
    matches: mappedMatches,
  };
}
