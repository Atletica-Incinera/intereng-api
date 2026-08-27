import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { EditionActionContext } from '../edition-actions.types';
import { ContextActionHandler } from './context-action.handler';

/**
 * Revogar acesso deixava a linha no banco e o cartao "REVOGADO" na tela.
 * `staff/remove` apaga a atribuicao.
 *
 * A conta em si e outra decisao, e a mais delicada: apagar quem ja operou um
 * jogo ou aparece na auditoria levaria embora justamente o registro que existe
 * para sobreviver a quem saiu. Por isso a conta so cai quando nao ha rastro
 * nenhum -- o convite com e-mail errado, que e quando remover de verdade
 * importa.
 */
describe('ContextActionHandler — remoção de acesso do staff', () => {
  function montar(opcoes: { rastro?: number; alvoSuperAdmin?: boolean; atorSuperAdmin?: boolean } = {}) {
    const rastro = opcoes.rastro ?? 0;
    const contar = jest.fn().mockResolvedValue(rastro);
    const staffDelete = jest.fn().mockResolvedValue({ id: 'staff-2' });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

    const context = {
      edition: { id: 'ed-2026' },
      user: { id: 'staff-1', isSuperAdmin: opcoes.atorSuperAdmin ?? true },
      transaction: {
        staff: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'staff-2',
            name: 'Luiza Cavalcanti',
            isSuperAdmin: opcoes.alvoSuperAdmin ?? false,
          }),
          delete: staffDelete,
        },
        editionStaffRole: {
          findMany: jest.fn().mockResolvedValue([{ id: 'papel-1' }]),
          deleteMany,
          count: contar,
        },
        auditLog: { count: contar },
        match: { count: contar },
        matchEvent: { count: contar },
        matchCorrection: { count: contar },
        overallAward: { count: contar },
        overallClosure: { count: contar },
        refreshSession: { count: contar },
      },
    } as unknown as EditionActionContext;

    const handler = new ContextActionHandler({ staffInvitePassword: 'x' } as ConfigService);
    return { handler, context, staffDelete, deleteMany };
  }

  it('apaga a atribuição e, sem rastro nenhum, a conta também', async () => {
    const { handler, context, staffDelete, deleteMany } = montar();

    await handler.staffRemove(context, { email: 'lmc6@cin.ufpe.br' });

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['papel-1'] } } });
    expect(staffDelete).toHaveBeenCalledWith({ where: { id: 'staff-2' } });
  });

  it('preserva a conta de quem já deixou rastro no sistema', async () => {
    const { handler, context, staffDelete, deleteMany } = montar({ rastro: 1 });

    await handler.staffRemove(context, { email: 'lmc6@cin.ufpe.br' });

    expect(deleteMany).toHaveBeenCalled();
    // A auditoria existe para sobreviver a quem saiu.
    expect(staffDelete).not.toHaveBeenCalled();
  });

  it('recusa remover o próprio acesso', async () => {
    const { handler, context } = montar();
    (context.transaction.staff as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValue(
      { id: 'staff-1', name: 'Eu', isSuperAdmin: false },
    );

    await expect(handler.staffRemove(context, { email: 'eu@cin.ufpe.br' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('impede o admin da edição de remover um super administrador', async () => {
    const { handler, context } = montar({ alvoSuperAdmin: true, atorSuperAdmin: false });

    await expect(handler.staffRemove(context, { email: 'chefe@cin.ufpe.br' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('recusa quando a pessoa não tem acesso nesta edição', async () => {
    const { handler, context } = montar();
    (
      context.transaction.editionStaffRole as unknown as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([]);

    await expect(handler.staffRemove(context, { email: 'lmc6@cin.ufpe.br' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
