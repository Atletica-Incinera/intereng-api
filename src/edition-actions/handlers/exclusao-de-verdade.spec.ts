import { ConflictException, NotFoundException } from '@nestjs/common';
import { UploadsService } from '../../uploads/uploads.service';
import { EditionActionContext } from '../edition-actions.types';
import { CatalogActionHandler } from './catalog-action.handler';

/**
 * "Remover" no app sempre foi uma marca: `enabled: false` na modalidade,
 * `revokedAt` no acesso. O registro ficava, e a tela mostrava um cartao
 * "REMOVIDA" no meio dos ativos.
 *
 * Estas acoes apagam de verdade -- e e por isso que a trava importa mais que a
 * exclusao. Apagar uma modalidade que ainda tem categoria levaria jogo e
 * resultado junto. O que este arquivo garante e que a recusa venha antes, e
 * que ela diga o que esta no caminho, em vez de um erro generico que obriga a
 * adivinhar.
 */
describe('CatalogActionHandler — exclusão de modalidade', () => {
  function montar(dependencias: Partial<Record<string, number>> = {}, outrasEdicoes = 0) {
    const contar = (chave: string) => jest.fn().mockResolvedValue(dependencias[chave] ?? 0);
    const editionDisciplineDelete = jest.fn().mockResolvedValue({ id: 'ed-futsal' });
    const disciplineDelete = jest.fn().mockResolvedValue({ id: 'futsal' });
    const context = {
      edition: { id: 'ed-2026' },
      transaction: {
        editionDiscipline: {
          findFirst: jest.fn().mockResolvedValue({ id: 'ed-futsal', disciplineId: 'futsal' }),
          count: jest.fn().mockResolvedValue(outrasEdicoes),
          delete: editionDisciplineDelete,
        },
        discipline: { delete: disciplineDelete },
        tournament: { count: contar('categorias') },
        editionRoster: { count: contar('elencos') },
        editionStaffRole: { count: contar('gestores') },
        overallAward: { count: contar('premiacoes') },
      },
    } as unknown as EditionActionContext;
    const handler = new CatalogActionHandler({} as unknown as UploadsService);
    return { handler, context, editionDisciplineDelete, disciplineDelete };
  }

  it('apaga o vínculo quando nada depende da modalidade', async () => {
    const { handler, context, editionDisciplineDelete, disciplineDelete } = montar();

    await handler.disciplineDelete(context, { name: 'Futsal' });

    expect(editionDisciplineDelete).toHaveBeenCalledWith({ where: { id: 'ed-futsal' } });
    // Nenhuma outra edição usa a modalidade, então ela sai do catálogo também.
    expect(disciplineDelete).toHaveBeenCalledWith({ where: { id: 'futsal' } });
  });

  it('preserva a modalidade global quando outra edição ainda a usa', async () => {
    const { handler, context, editionDisciplineDelete, disciplineDelete } = montar({}, 1);

    await handler.disciplineDelete(context, { name: 'Futsal' });

    expect(editionDisciplineDelete).toHaveBeenCalled();
    expect(disciplineDelete).not.toHaveBeenCalled();
  });

  it('recusa e diz o que está no caminho', async () => {
    const { handler, context, editionDisciplineDelete } = montar({ categorias: 2, elencos: 7 });

    await expect(handler.disciplineDelete(context, { name: 'Futsal' })).rejects.toThrow(
      ConflictException,
    );
    await expect(handler.disciplineDelete(context, { name: 'Futsal' })).rejects.toThrow(
      /2 categorias.*7 atletas inscritos/,
    );
    expect(editionDisciplineDelete).not.toHaveBeenCalled();
  });

  it('conta uma dependência no singular', async () => {
    const { handler, context } = montar({ categorias: 1 });

    await expect(handler.disciplineDelete(context, { name: 'Futsal' })).rejects.toThrow(
      /1 categoria(?! )/,
    );
  });

  it('recusa modalidade que não pertence à edição', async () => {
    const { handler, context } = montar();
    (
      context.transaction.editionDiscipline as unknown as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue(null);

    await expect(handler.disciplineDelete(context, { name: 'Vôlei' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
