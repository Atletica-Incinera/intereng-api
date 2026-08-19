import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { StandingsService } from './standings.service';

/**
 * Trava estrutural do motor único de classificação.
 *
 * Não valida números: valida ALCANCE. Depois do cutover parcial, o motor legado
 * (`StandingsService.recomputeStandings` + `StandingsCalculator`) continua no repositório apenas
 * para sustentar os testes existentes, mas não pode ter nenhum chamador de produção nem nenhum
 * gatilho por evento. Estes testes falham no instante em que alguém religa o segundo motor.
 *
 * Roda sem banco: apenas lê os fontes de `src/`.
 */

const SRC_ROOT = join(__dirname, '..');
const RECALCULATION_ENGINE = 'edition-actions/edition-action-recalculation.service.ts';
const LEGACY_ENGINE = 'standings/standings.service.ts';

interface SourceFile {
  path: string;
  source: string;
}

function collectProductionSources(directory: string): SourceFile[] {
  const collected: SourceFile[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);

    if (statSync(fullPath).isDirectory()) {
      collected.push(...collectProductionSources(fullPath));
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) {
      continue;
    }

    collected.push({
      path: relative(SRC_ROOT, fullPath).split(sep).join('/'),
      source: readFileSync(fullPath, 'utf8'),
    });
  }

  return collected;
}

describe('phase_standings tem um único motor alcançável', () => {
  const productionSources = collectProductionSources(SRC_ROOT);

  it('encontra os fontes de produção (guarda contra varredura vazia)', () => {
    expect(productionSources.length).toBeGreaterThan(50);
    expect(productionSources.map((file) => file.path)).toContain(RECALCULATION_ENGINE);
    expect(productionSources.map((file) => file.path)).toContain(LEGACY_ENGINE);
  });

  it('só dois arquivos de produção escrevem em phase_standings', () => {
    const writers = productionSources
      .filter((file) =>
        /phaseStanding\.(?:createMany|deleteMany|updateMany|create|update|upsert|delete)\b/.test(
          file.source,
        ),
      )
      .map((file) => file.path)
      .sort();

    // O legado (LEGACY_ENGINE) só é tolerado porque o teste seguinte prova que ele é inalcançável.
    expect(writers).toEqual([RECALCULATION_ENGINE, LEGACY_ENGINE].sort());
  });

  it('o motor legado não tem nenhum chamador de produção', () => {
    const callers = productionSources
      .filter((file) => file.path !== LEGACY_ENGINE && file.source.includes('recomputeStandings'))
      .map((file) => file.path);

    expect(callers).toEqual([]);
  });

  it('o motor legado não é acionado por nenhum evento de domínio', () => {
    const legacy = productionSources.find((file) => file.path === LEGACY_ENGINE);

    expect(legacy).toBeDefined();
    expect(legacy!.source).not.toContain('@OnEvent');
    expect(Object.getOwnPropertyNames(StandingsService.prototype)).not.toContain(
      'handleMatchFinished',
    );
  });

  it('StandingsCalculator não é usado fora do motor legado em quarentena', () => {
    const users = productionSources
      .filter((file) => file.path !== LEGACY_ENGINE && file.source.includes('StandingsCalculator'))
      .map((file) => file.path)
      .sort();

    expect(users).toEqual(['standings/standings-calculator.ts']);
  });
});
