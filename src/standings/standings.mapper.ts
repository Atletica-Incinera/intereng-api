/**
 * Converte um registro de classificação de fase (PhaseStanding) retornado pelo banco de dados
 * (incluindo o relacionamento com a inscrição e o time ou atleta associado) em um DTO de resposta
 * padronizado para a API.
 *
 * Resolve dinamicamente o nome da inscrição (entryName) verificando se a inscrição é de uma
 * modalidade coletiva (associada a um `team`) ou individual (associada a um `athlete`), caindo
 * para um valor genérico caso nenhum esteja presente.
 *
 * @param standing O objeto de classificação retornado pelo Prisma com seus relacionamentos carregados.
 * @returns Um objeto DTO formatado com estatísticas e classificação da equipe/atleta.
 */
export function toStandingResponseDto(standing: any) {
  let entryName = 'Time/Atleta';

  if (standing.entry) {
    if (standing.entry.team) {
      entryName = standing.entry.team.name;
    } else if (standing.entry.athlete) {
      entryName = standing.entry.athlete.name;
    }
  }

  return {
    entryId: standing.entryId,
    entryName,
    played: standing.played,
    won: standing.won,
    drawn: standing.drawn,
    lost: standing.lost,
    scoreFor: standing.scoreFor,
    scoreAgainst: standing.scoreAgainst,
    points: standing.points,
    rank: standing.rank,
  };
}
