import { ConfigService } from '../../common/config/config.service';
import { EditionActionContext } from '../edition-actions.types';
import { ContextActionHandler } from './context-action.handler';

describe('ContextActionHandler.promoteSuperAdmin', () => {
  const mockConfig = {
    staffInvitePassword: 'convite-inicial-forte-123',
  } as unknown as ConfigService;
  const handler = new ContextActionHandler(mockConfig);

  function contextWith(transaction: unknown): EditionActionContext {
    return {
      transaction,
      edition: { id: 'edition-1' } as EditionActionContext['edition'],
      user: { id: 'user-1', isSuperAdmin: true },
      actorName: 'Super Admin',
      scope: { kind: 'full' },
    } as EditionActionContext;
  }

  function mockTransaction(existingStaff: { id: string; isSuperAdmin: boolean } | null) {
    return {
      staff: {
        findUnique: jest.fn().mockResolvedValue(existingStaff),
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'staff-new' }),
      },
      competitionEdition: {
        findMany: jest.fn().mockResolvedValue([{ id: 'edition-1' }]),
      },
    };
  }

  it('cria uma conta nova já como super admin quando o e-mail não existe', async () => {
    const transaction = mockTransaction(null);

    const result = await handler.promoteSuperAdmin(contextWith(transaction), {
      email: 'nova@intereng.com',
      name: 'Nova Super Admin',
    });

    expect(transaction.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'nova@intereng.com',
          isSuperAdmin: true,
          // A senha vem do mesmo convite compartilhado que staff/upsert usa —
          // e a marca obriga a troca no primeiro acesso, então não fica valendo.
          mustChangePassword: true,
        }),
      }),
    );
    expect(result.entityId).toBe('staff-new');
  });

  it('promove uma conta existente sem reescrever o nome já cadastrado', async () => {
    const transaction = mockTransaction({ id: 'staff-existente', isSuperAdmin: false });

    const result = await handler.promoteSuperAdmin(contextWith(transaction), {
      email: 'ana@ufpe.br',
      // Nome divergente de propósito: não deve prevalecer sobre o já
      // cadastrado — só é usado para criar conta nova.
      name: 'Nome Diferente Do Cadastro',
    });

    expect(transaction.staff.update).toHaveBeenCalledWith({
      where: { id: 'staff-existente' },
      data: { isSuperAdmin: true },
    });
    expect(transaction.staff.create).not.toHaveBeenCalled();
    expect(result.entityId).toBe('staff-existente');
  });

  it('é idempotente quando a conta já é super admin', async () => {
    const transaction = mockTransaction({ id: 'staff-ja-admin', isSuperAdmin: true });

    await handler.promoteSuperAdmin(contextWith(transaction), {
      email: 'ja@admin.com',
      name: 'Já Admin',
    });

    expect(transaction.staff.update).not.toHaveBeenCalled();
    expect(transaction.staff.create).not.toHaveBeenCalled();
  });
});
