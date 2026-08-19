import { SnapshotMapper } from './snapshot.mapper';
import type { ResolvedEdition } from './active-edition.resolver';
import type { UploadsService } from '../uploads/uploads.service';

describe('SnapshotMapper.loadStaff', () => {
  const mapper = new SnapshotMapper({} as UploadsService);
  const edition = { id: 'edition-1', name: '2027' } as ResolvedEdition;

  function loadStaff(roles: unknown[]) {
    const transaction = {
      editionStaffRole: { findMany: jest.fn().mockResolvedValue(roles) },
    };
    // loadStaff é privado: cobre a mesma lógica que build() exercitaria, sem
    // montar o snapshot inteiro só para chegar nesta parte.
    return (mapper as unknown as { loadStaff: (tx: unknown, e: ResolvedEdition) => Promise<unknown> })
      .loadStaff(transaction, edition);
  }

  function role(overrides: Partial<{
    id: string;
    staffId: string;
    editionDisciplineId: string | null;
    role: 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';
    revokedAt: Date | null;
  }>) {
    return {
      id: 'role-1',
      staffId: 'staff-1',
      editionDisciplineId: null,
      role: 'EDITION_ADMIN' as const,
      revokedAt: null,
      staff: { name: 'Luiza Cavalcanti', email: 'lmc6@cin.ufpe.br' },
      editionDiscipline: null,
      ...overrides,
    };
  }

  it('não duplica a pessoa quando revogar e reconceder o mesmo papel cria uma linha nova', async () => {
    // Reproduz exatamente o achado em produção: revogar não reescreve a
    // atribuição — grava uma linha nova e marca a antiga com revokedAt.
    const revoked = role({ id: 'role-old', revokedAt: new Date('2026-01-01') });
    const reinstated = role({ id: 'role-new', revokedAt: null });

    const staff = await loadStaff([revoked, reinstated]) as Record<string, { revoked?: boolean }>;

    expect(Object.keys(staff)).toHaveLength(1);
    expect(Object.values(staff)[0].revoked).toBeUndefined();
  });

  it('mantém revogada quando não há nenhuma reconcessão mais recente', async () => {
    const staff = await loadStaff([role({ revokedAt: new Date('2026-01-01') })]) as Record<string, { revoked?: boolean }>;

    expect(Object.values(staff)[0].revoked).toBe(true);
  });

  it('preserva papéis genuinamente distintos da mesma pessoa (duas modalidades)', async () => {
    const futsal = role({ id: 'role-futsal', role: 'DISCIPLINE_MANAGER', editionDisciplineId: 'disc-futsal' });
    const volei = role({ id: 'role-volei', role: 'DISCIPLINE_MANAGER', editionDisciplineId: 'disc-volei' });

    const staff = await loadStaff([futsal, volei]);

    expect(Object.keys(staff as object)).toHaveLength(2);
  });
});
