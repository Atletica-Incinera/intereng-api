import { EditionSnapshotsService } from './edition-snapshots.service';
import type { ActiveEditionResolver } from './active-edition.resolver';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { RedisService } from '../common/redis/redis.service';
import type { SnapshotMapper } from './snapshot.mapper';

describe('EditionSnapshotsService.isFrontendSnapshot', () => {
  const service = new EditionSnapshotsService(
    {} as PrismaService,
    {} as RedisService,
    {} as ActiveEditionResolver,
    {} as SnapshotMapper,
  );

  // isFrontendSnapshot é privado: é o único portão entre o que está gravado no
  // Redis e o que a rota pública devolve, e chegar nele pelo serviço inteiro
  // exigiria banco e cache de verdade.
  function accepts(snapshot: Record<string, unknown>): boolean {
    return (
      service as unknown as { isFrontendSnapshot: (value: unknown) => boolean }
    ).isFrontendSnapshot(snapshot);
  }

  function snapshot(overrides: Record<string, unknown> = {}) {
    return {
      competitions: [],
      editions: [],
      teams: {},
      athletes: {},
      disciplines: {},
      tournaments: {},
      matches: {},
      overallRanking: { metrics: [], awards: [], closures: [] },
      staff: {},
      superAdmins: [],
      audit: [],
      ...overrides,
    };
  }

  it('aceita o snapshot completo', () => {
    expect(accepts(snapshot())).toBe(true);
  });

  it('recusa o snapshot gravado antes de superAdmins existir', () => {
    // A chave do cache leva a revisão da edição, não a forma do payload: sem
    // esta recusa, um snapshot da versão anterior seguiria sendo servido por
    // até uma hora depois do deploy, sem o campo que o DTO promete.
    const { superAdmins: _superAdmins, ...antigo } = snapshot();

    expect(accepts(antigo)).toBe(false);
  });

  it('recusa o snapshot que ainda carrega preferences', () => {
    expect(accepts(snapshot({ preferences: {} }))).toBe(false);
  });
});
