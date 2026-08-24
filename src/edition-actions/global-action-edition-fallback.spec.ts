import { EditionActionsService } from './edition-actions.service';
import { NoActiveEditionException } from '../edition-snapshots/no-active-edition.exception';

/**
 * Ação global não depende de edição para GRAVAR — depende porque a resposta de
 * toda ação é um snapshot de edição. Promover um super administrador não toca
 * dado de edição nenhum e mesmo assim falhava sempre que não houvesse
 * competição ativa: exatamente o intervalo entre duas edições, e o momento em
 * que ter um segundo super admin mais importa.
 */
describe('EditionActionsService — edição para ação global', () => {
  function serviceWith(resolve: jest.Mock) {
    const snapshots = { resolveEditionInTransaction: resolve };
    return new EditionActionsService(
      {} as never,
      snapshots as unknown as ConstructorParameters<typeof EditionActionsService>[1],
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function resolver(service: EditionActionsService) {
    return (
      service as unknown as {
        resolveEditionForAction(
          transaction: unknown,
          editionId: string,
          actionType: string,
        ): Promise<{ id: string }>;
      }
    ).resolveEditionForAction.bind(service);
  }

  const semEdicaoAtiva = new NoActiveEditionException(
    'Não foi possível determinar a competição ativa.',
  );

  it('cai na edição mais recente quando a ação é global e não há ativa', async () => {
    const resolve = jest
      .fn()
      .mockRejectedValueOnce(semEdicaoAtiva)
      .mockResolvedValueOnce({ id: 'edicao-2025' });
    const transaction = {
      competitionEdition: { findFirst: jest.fn().mockResolvedValue({ id: 'edicao-2025' }) },
    };
    const service = serviceWith(resolve);

    await expect(
      resolver(service)(transaction, 'active', 'staff/promoteSuperAdmin'),
    ).resolves.toEqual({ id: 'edicao-2025' });
  });

  it('não estende o desvio a ação de edição: essa continua exigindo a ativa', async () => {
    const resolve = jest.fn().mockRejectedValue(semEdicaoAtiva);
    const transaction = { competitionEdition: { findFirst: jest.fn() } };
    const service = serviceWith(resolve);

    await expect(resolver(service)(transaction, 'active', 'match/schedule')).rejects.toBe(
      semEdicaoAtiva,
    );
    expect(transaction.competitionEdition.findFirst).not.toHaveBeenCalled();
  });

  it('sem nenhuma edição no banco a recusa continua — não há envelope a devolver', async () => {
    const resolve = jest.fn().mockRejectedValue(semEdicaoAtiva);
    const transaction = { competitionEdition: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = serviceWith(resolve);

    await expect(resolver(service)(transaction, 'active', 'staff/promoteSuperAdmin')).rejects.toBe(
      semEdicaoAtiva,
    );
  });
});
