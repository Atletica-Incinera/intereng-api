import { OverallPosition, Prisma } from '@prisma/client';

/**
 * Catálogo padrão do ranking geral: os mesmos IDs, nomes, pontos e posições que
 * o modo local semeia em `frontend-state.ts`. Precisam bater — uma edição
 * semeada aqui e outra semeada no navegador têm de pontuar igual, senão a
 * bonificação automática do pódio dá resultados diferentes conforme o ambiente.
 */
export const DEFAULT_OVERALL_METRICS = [
  {
    clientId: 'metric-champion',
    name: 'Campeão da modalidade',
    defaultPoints: 10,
    position: OverallPosition.CHAMPION,
  },
  {
    clientId: 'metric-runner-up',
    name: 'Vice-campeão',
    defaultPoints: 7,
    position: OverallPosition.RUNNER_UP,
  },
  {
    clientId: 'metric-third',
    name: 'Terceiro lugar',
    defaultPoints: 5,
    position: OverallPosition.THIRD,
  },
  {
    clientId: 'metric-participation',
    name: 'Participação',
    defaultPoints: 1,
    position: OverallPosition.PARTICIPATION,
  },
] as const;

/**
 * Cria o catálogo padrão numa edição que ainda não pontua nada e devolve quantas
 * métricas nasceram.
 *
 * A idempotência é por ausência, não por linha: basta uma métrica ativa para o
 * método não fazer nada. Quem já mexeu no ranking decidiu como ele pontua, e
 * reinjetar o padrão criaria linhas que ninguém pediu — inclusive duplicando a
 * bonificação de pódio, já que duas métricas podem ocupar a mesma posição.
 */
export async function seedDefaultOverallMetrics(
  transaction: Prisma.TransactionClient,
  editionId: string,
): Promise<number> {
  const existing = await transaction.overallMetric.count({
    where: { editionId, removedAt: null },
  });
  if (existing > 0) return 0;

  // Uma métrica padrão removida no passado continua no banco com `removedAt`, e
  // (editionId, clientId) segue único. Pular preserva a decisão de quem removeu
  // em vez de ressuscitá-la pelas costas.
  const created = await transaction.overallMetric.createMany({
    data: DEFAULT_OVERALL_METRICS.map((metric) => ({ editionId, ...metric })),
    skipDuplicates: true,
  });
  return created.count;
}
