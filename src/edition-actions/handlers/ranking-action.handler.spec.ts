import { OverallPosition } from '@prisma/client';
import { EditionActionContext } from '../edition-actions.types';
import { RankingActionHandler } from './ranking-action.handler';

describe('RankingActionHandler.updateMetric', () => {
  const handler = new RankingActionHandler();

  function mockTransaction() {
    return {
      overallClosure: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      overallMetric: {
        findUnique: jest.fn().mockResolvedValue({ id: 'metrica-db-1', removedAt: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  function contextWith(transaction: unknown): EditionActionContext {
    return {
      transaction,
      edition: { id: 'edition-1' } as EditionActionContext['edition'],
      user: { id: 'user-1', isSuperAdmin: true },
      actorName: 'Operador',
      scope: { kind: 'full' },
    } as EditionActionContext;
  }

  function updateData(transaction: ReturnType<typeof mockTransaction>): Record<string, unknown> {
    const [call] = transaction.overallMetric.update.mock.calls;
    return (call[0] as { data: Record<string, unknown> }).data;
  }

  it('não toca na coluna quando a posição está ausente do patch', async () => {
    const transaction = mockTransaction();

    await handler.updateMetric(contextWith(transaction), {
      metricId: 'metrica-1',
      patch: { name: 'Bonificação de pódio' },
    });

    const data = updateData(transaction);
    // A chave precisa estar de fato ausente: mandar `position: undefined` para o
    // Prisma seria indistinguível de limpar em alguns caminhos de update.
    expect('position' in data).toBe(false);
    expect(data).toEqual({ name: 'Bonificação de pódio' });
  });

  it('limpa a coluna quando a posição vem como null', async () => {
    const transaction = mockTransaction();

    await handler.updateMetric(contextWith(transaction), {
      metricId: 'metrica-1',
      patch: { position: null },
    });

    expect(transaction.overallMetric.update).toHaveBeenCalledWith({
      where: { id: 'metrica-db-1' },
      data: { position: null },
    });
  });

  it('grava a posição quando vem como texto', async () => {
    const transaction = mockTransaction();

    await handler.updateMetric(contextWith(transaction), {
      metricId: 'metrica-1',
      patch: { position: 'campeao' },
    });

    expect(transaction.overallMetric.update).toHaveBeenCalledWith({
      where: { id: 'metrica-db-1' },
      data: { position: OverallPosition.CHAMPION },
    });
  });

  it('recusa uma posição que não existe no domínio', async () => {
    const transaction = mockTransaction();

    await expect(
      handler.updateMetric(contextWith(transaction), {
        metricId: 'metrica-1',
        patch: { position: 'quarto' },
      }),
    ).rejects.toThrow('A posição da métrica é inválida.');
    expect(transaction.overallMetric.update).not.toHaveBeenCalled();
  });
});
