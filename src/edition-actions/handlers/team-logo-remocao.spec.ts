import { UploadsService } from '../../uploads/uploads.service';
import { EditionActionContext } from '../edition-actions.types';
import { CatalogActionHandler } from './catalog-action.handler';

/**
 * Remover o escudo de uma equipe exige distinguir tres coisas num patch:
 * campo ausente (nao mexe), string (troca) e `null` (remove). Sem o `null`
 * so havia como trocar um escudo por outro, e a tela do app ficava com um
 * botao de remover que o servidor recusava.
 *
 * O outro ponto que este arquivo trava e a validacao: `assertValidTeamLogo`
 * confere se o arquivo existe no armazenamento, e chama-la com `null` seria
 * consultar um objeto sem chave.
 */
describe('CatalogActionHandler — remocao do escudo da equipe', () => {
  function montar() {
    const assertValidTeamLogo = jest.fn().mockResolvedValue(undefined);
    const handler = new CatalogActionHandler({
      assertValidTeamLogo,
    } as unknown as UploadsService);

    const update = jest.fn().mockResolvedValue({ id: 'alcateia' });
    const context = {
      edition: { id: 'ed-2026' },
      transaction: {
        editionTeam: {
          findUnique: jest.fn().mockResolvedValue({ id: 'link-1' }),
          findMany: jest.fn().mockResolvedValue([{ editionId: 'ed-2026' }]),
          update: jest.fn(),
        },
        team: { update },
      },
    } as unknown as EditionActionContext;

    return { handler, context, update, assertValidTeamLogo };
  }

  it('grava logoKey nulo quando o patch manda logo: null', async () => {
    const { handler, context, update, assertValidTeamLogo } = montar();

    await handler.teamUpdate(context, { id: 'alcateia', patch: { logo: null } });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'alcateia' }, data: { logoKey: null } }),
    );
    // Nao existe objeto a conferir no armazenamento quando a chave e nula.
    expect(assertValidTeamLogo).not.toHaveBeenCalled();
  });

  it('troca o escudo quando o patch manda uma chave', async () => {
    const { handler, context, update, assertValidTeamLogo } = montar();

    await handler.teamUpdate(context, {
      id: 'alcateia',
      patch: { logo: '/teams/voraz.webp' },
    });

    expect(assertValidTeamLogo).toHaveBeenCalledWith('alcateia', '/teams/voraz.webp');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { logoKey: '/teams/voraz.webp' } }),
    );
  });

  it('nao toca no escudo quando o patch nao fala dele', async () => {
    const { handler, context, update } = montar();

    await handler.teamUpdate(context, {
      id: 'alcateia',
      patch: { responsible: 'Ana Ribeiro' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { responsible: 'Ana Ribeiro' } }),
    );
    const [[chamada]] = update.mock.calls as [[{ data: Record<string, unknown> }]];
    expect('logoKey' in chamada.data).toBe(false);
  });
});
