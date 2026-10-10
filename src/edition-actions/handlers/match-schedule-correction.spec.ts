import { ConflictException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { EditionActionContext } from '../edition-actions.types';
import { MatchActionHandler } from './match-action.handler';

describe('correções de partidas agendadas', () => {
  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 'partida-1',
    status: MatchStatus.SCHEDULED,
    scheduledAt: new Date('2026-10-10T11:15:00Z'),
    lastEventSequence: 0,
    startedAt: null,
    phase: { tournamentId: 'categoria-1', tournament: { editionDisciplineId: 'modalidade-1' } },
    ...overrides,
  });

  const setup = (match = stored()) => {
    const transaction = {
      match: {
        findFirst: jest.fn().mockResolvedValue(match),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grupo-b', phaseId: 'fase-grupos' }),
      },
    };
    const context = { transaction, edition: { id: 'edicao-1' } } as unknown as EditionActionContext;
    return { handler: new MatchActionHandler(undefined!), context, transaction };
  };

  it('move a partida agendada para o grupo pedido', async () => {
    const { handler, context, transaction } = setup();
    await handler.update(context, { id: 'partida-1', patch: { phase: 'Grupo B' } });
    expect(transaction.group.findFirst).toHaveBeenCalledWith({
      where: { name: 'Grupo B', phase: { tournamentId: 'categoria-1' } },
      select: { id: true, phaseId: true },
    });
    expect(transaction.match.update).toHaveBeenCalledWith({
      where: { id: 'partida-1' },
      data: expect.objectContaining({ phaseId: 'fase-grupos', groupId: 'grupo-b' }),
    });
  });

  it('não move partida iniciada', async () => {
    const { handler, context, transaction } = setup(stored({ status: MatchStatus.LIVE }));
    await expect(handler.update(context, { id: 'partida-1', patch: { phase: 'Grupo B' } })).rejects.toThrow(ConflictException);
    expect(transaction.match.update).not.toHaveBeenCalled();
  });

  it('exclui apenas partida agendada sem início ou eventos', async () => {
    const { handler, context, transaction } = setup();
    await handler.delete(context, { id: 'partida-1' });
    expect(transaction.match.delete).toHaveBeenCalledWith({ where: { id: 'partida-1' } });
  });

  it.each([
    { status: MatchStatus.LIVE },
    { lastEventSequence: 1 },
    { startedAt: new Date('2026-10-10T11:16:00Z') },
  ])('impede excluir partida que já foi operada (%o)', async (state) => {
    const { handler, context, transaction } = setup(stored(state));
    await expect(handler.delete(context, { id: 'partida-1' })).rejects.toThrow(ConflictException);
    expect(transaction.match.delete).not.toHaveBeenCalled();
  });
});
