import { ConflictException, NotFoundException } from '@nestjs/common';
import { UploadsService } from '../../uploads/uploads.service';
import { EditionActionContext } from '../edition-actions.types';
import { CatalogActionHandler } from './catalog-action.handler';

describe('CatalogActionHandler — vínculo de equipe do catálogo', () => {
  function montar(team: { id: string; archived: boolean } | null = { id: 'alcateia', archived: false }) {
    const upsert = jest.fn().mockResolvedValue({ id: 'link-1' });
    const handler = new CatalogActionHandler({} as UploadsService);
    const context = {
      edition: { id: 'copa-halterada-2026' },
      transaction: {
        team: { findUnique: jest.fn().mockResolvedValue(team) },
        editionTeam: { upsert },
      },
    } as unknown as EditionActionContext;
    return { handler, context, upsert };
  }

  it('cria ou reativa somente o vínculo da equipe com a edição', async () => {
    const { handler, context, upsert } = montar();

    await expect(handler.teamAttach(context, { id: 'alcateia' })).resolves.toEqual({
      entityType: 'EditionTeam', entityId: 'alcateia',
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { editionId_teamId: { editionId: 'copa-halterada-2026', teamId: 'alcateia' } },
      create: { editionId: 'copa-halterada-2026', teamId: 'alcateia' },
      update: { archived: false },
    });
  });

  it('recusa id inexistente e equipe arquivada globalmente', async () => {
    const missing = montar(null);
    await expect(missing.handler.teamAttach(missing.context, { id: 'nao-existe' }))
      .rejects.toBeInstanceOf(NotFoundException);

    const archived = montar({ id: 'alcateia', archived: true });
    await expect(archived.handler.teamAttach(archived.context, { id: 'alcateia' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
