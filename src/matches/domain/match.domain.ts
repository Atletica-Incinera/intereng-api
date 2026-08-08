/**
 * Função utilitária do domínio de partidas para determinar o vencedor
 * com base na pontuação atual de cada inscrição.
 *
 * @param scoreA Pontuação da inscrição A.
 * @param scoreB Pontuação da inscrição B.
 * @param entryAId ID da inscrição A (pode ser nulo).
 * @param entryBId ID da inscrição B (pode ser nulo).
 * @returns O ID da inscrição vencedora, ou null em caso de empate.
 */
export function determineWinner(
  scoreA: number,
  scoreB: number,
  entryAId: string | null,
  entryBId: string | null,
): string | null {
  if (scoreA > scoreB) {
    return entryAId;
  }
  if (scoreB > scoreA) {
    return entryBId;
  }
  return null;
}

/**
 * Valida se as duas inscrições fornecidas são idênticas.
 *
 * @param entryAId ID da inscrição A.
 * @param entryBId ID da inscrição B.
 * @returns void
 * @throws Error se as inscrições forem idênticas.
 */
export function validateDifferentEntries(
  entryAId: string | null | undefined,
  entryBId: string | null | undefined,
): void {
  if (entryAId && entryBId && entryAId === entryBId) {
    throw new Error('As duas inscrições da partida não podem ser iguais.');
  }
}
