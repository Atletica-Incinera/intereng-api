import { SnapshotMapper } from './snapshot.mapper';
import type { ResolvedEdition } from './active-edition.resolver';
import type { UploadsService } from '../uploads/uploads.service';

const mapper = new SnapshotMapper({} as UploadsService);
const edition = { id: 'edition-1', name: '2027' } as ResolvedEdition;

type StaffCard = { name: string; email: string; revoked?: boolean; superAdmin?: boolean };
type SuperAdminCard = { id: string; name: string; email: string; initials: string };

function transactionWith(roles: unknown[], superAdmins: unknown[] = []) {
  return {
    editionStaffRole: { findMany: jest.fn().mockResolvedValue(roles) },
    staff: { findMany: jest.fn().mockResolvedValue(superAdmins) },
  };
}

// loadStaff, loadSuperAdmins e mergeSuperAdmins são privados: cobrem a mesma
// lógica que build() exercitaria, sem montar o snapshot inteiro só para chegar
// nesta parte.
function loadStaff(roles: unknown[]) {
  return (
    mapper as unknown as {
      loadStaff: (tx: unknown, e: ResolvedEdition) => Promise<Record<string, StaffCard>>;
    }
  ).loadStaff(transactionWith(roles), edition);
}

function loadSuperAdmins(
  accounts: unknown[],
  options: unknown = { public: false, scope: { kind: 'full' } },
) {
  return (
    mapper as unknown as {
      loadSuperAdmins: (tx: unknown, o: unknown) => Promise<SuperAdminCard[]>;
    }
  ).loadSuperAdmins(transactionWith([], accounts), options);
}

function mergeSuperAdmins(staff: Record<string, StaffCard>, accounts: SuperAdminCard[]) {
  return (
    mapper as unknown as {
      mergeSuperAdmins: (
        s: Record<string, StaffCard>,
        a: SuperAdminCard[],
      ) => { staff: Record<string, StaffCard>; superAdmins: SuperAdminCard[] };
    }
  ).mergeSuperAdmins(staff, accounts);
}

function role(
  overrides: Partial<{
    id: string;
    staffId: string;
    editionDisciplineId: string | null;
    role: 'EDITION_ADMIN' | 'DISCIPLINE_MANAGER';
    revokedAt: Date | null;
    staff: { name: string; email: string };
  }>,
) {
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

function account(overrides: Partial<{ id: string; name: string; email: string }> = {}) {
  return {
    id: 'staff-1',
    name: 'Luiza Cavalcanti',
    email: 'lmc6@cin.ufpe.br',
    ...overrides,
  };
}

describe('SnapshotMapper.loadStaff', () => {
  it('não duplica a pessoa quando revogar e reconceder o mesmo papel cria uma linha nova', async () => {
    // Reproduz exatamente o achado em produção: revogar não reescreve a
    // atribuição — grava uma linha nova e marca a antiga com revokedAt.
    const revoked = role({ id: 'role-old', revokedAt: new Date('2026-01-01') });
    const reinstated = role({ id: 'role-new', revokedAt: null });

    const staff = await loadStaff([revoked, reinstated]);

    expect(Object.keys(staff)).toHaveLength(1);
    expect(Object.values(staff)[0].revoked).toBeUndefined();
  });

  it('mantém revogada quando não há nenhuma reconcessão mais recente', async () => {
    const staff = await loadStaff([role({ revokedAt: new Date('2026-01-01') })]);

    expect(Object.values(staff)[0].revoked).toBe(true);
  });

  it('preserva papéis genuinamente distintos da mesma pessoa (duas modalidades)', async () => {
    const futsal = role({
      id: 'role-futsal',
      role: 'DISCIPLINE_MANAGER',
      editionDisciplineId: 'disc-futsal',
    });
    const volei = role({
      id: 'role-volei',
      role: 'DISCIPLINE_MANAGER',
      editionDisciplineId: 'disc-volei',
    });

    const staff = await loadStaff([futsal, volei]);

    expect(Object.keys(staff)).toHaveLength(2);
  });
});

describe('SnapshotMapper.loadSuperAdmins', () => {
  it('mostra o super admin que não tem papel nenhum na edição', async () => {
    // O motivo da lista existir: sem linha em EditionStaffRole, conceder super
    // admin não mudava nada na tela.
    const superAdmins = await loadSuperAdmins([account({ id: 'staff-9', name: 'Pedro Henrique' })]);

    const merged = mergeSuperAdmins({}, superAdmins);

    expect(merged.superAdmins).toEqual([
      expect.objectContaining({ id: 'staff-9', initials: 'PH' }),
    ]);
  });

  it('pessoa que é super admin e admin da edição rende um único card, marcado', async () => {
    const staff = await loadStaff([role({})]);
    const superAdmins = await loadSuperAdmins([account()]);

    const merged = mergeSuperAdmins(staff, superAdmins);

    expect(Object.keys(merged.staff)).toHaveLength(1);
    expect(Object.values(merged.staff)[0].superAdmin).toBe(true);
    expect(merged.superAdmins).toEqual([]);
  });

  it('não expõe super admins no snapshot público nem no recorte por modalidade', async () => {
    // Contrato já testado pelo e2e do front, que assere staff vazio: a lista
    // irmã não pode ser a porta dos fundos para os mesmos dados.
    const publico = await loadSuperAdmins([account()], {
      public: true,
      scope: { kind: 'full' },
    });
    const porModalidade = await loadSuperAdmins([account()], {
      public: false,
      scope: { kind: 'discipline', editionDisciplineId: 'disc-futsal' },
    });

    expect(publico).toEqual([]);
    expect(porModalidade).toEqual([]);
  });
});
