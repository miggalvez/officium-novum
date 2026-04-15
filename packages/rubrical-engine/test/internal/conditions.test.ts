import { parseCondition } from '@officium-nova/parser';
import { describe, expect, it } from 'vitest';

import { defaultResolveRank, type ResolvedVersion, type RubricalPolicy, asVersionHandle } from '../../src/index.js';
import { conditionMatches } from '../../src/internal/conditions.js';

describe('conditionMatches', () => {
  it('evaluates aut / et / nisi combinations', () => {
    const version = makeVersion('Rubrics 1960 - 1960', {
      name: 'rubrics-1960',
      resolveRank: defaultResolveRank
    });
    const condition = parseCondition('(rubrica 1960 aut tempore adventus) et nisi feria vi');

    expect(
      conditionMatches(condition, {
        date: { year: 2024, month: 12, day: 1 },
        dayOfWeek: 0,
        season: 'advent',
        version
      })
    ).toBe(true);

    expect(
      conditionMatches(condition, {
        date: { year: 2024, month: 12, day: 6 },
        dayOfWeek: 5,
        season: 'advent',
        version
      })
    ).toBe(false);
  });

  it('matches season predicates against supported LiturgicalSeason values', () => {
    const version = makeVersion('Divino Afflatu - 1954', {
      name: 'divino-afflatu',
      resolveRank: defaultResolveRank
    });

    expect(matches('tempore adventus', 'advent', version)).toBe(true);
    expect(matches('tempore quadragesimae', 'lent', version)).toBe(true);
    expect(matches('tempore quadragesimae', 'passiontide', version)).toBe(true);
    expect(matches('tempore paschali', 'eastertide', version)).toBe(true);
    expect(matches('tempore paschali', 'ascensiontide', version)).toBe(true);
    expect(matches('tempore pentecostes', 'pentecost-octave', version)).toBe(true);
    expect(matches('tempore epiphaniae', 'time-after-epiphany', version)).toBe(true);
    expect(matches('tempore nativitatis', 'christmastide', version)).toBe(true);
  });

  it('matches feria in Roman numerals and Arabic, plus mense/die numerics', () => {
    const version = makeVersion('Reduced - 1955', {
      name: 'reduced-1955',
      resolveRank: defaultResolveRank
    });

    const context = {
      date: { year: 2024, month: 3, day: 6 },
      dayOfWeek: 3,
      season: 'lent' as const,
      version
    };

    expect(conditionMatches(parseCondition('feria iv'), context)).toBe(true);
    expect(conditionMatches(parseCondition('feria 4'), context)).toBe(true);
    expect(conditionMatches(parseCondition('mense 3 et die 6'), context)).toBe(true);
    expect(conditionMatches(parseCondition('mense 3 et nisi die 7'), context)).toBe(true);
  });

  it('fans out rubric tags for monastic, cistercian, dominican, and Newcal handles', () => {
    const monastic = makeVersion('Monastic - 1963 - Barroux', {
      name: 'monastic-1963',
      resolveRank: defaultResolveRank
    });
    const cistercian = makeVersion('Monastic Tridentinum Cisterciensis Altovadensis', {
      name: 'cistercian-altovadense',
      resolveRank: defaultResolveRank
    });
    const dominican = makeVersion('Ordo Praedicatorum - 1962', {
      name: 'dominican-1962',
      resolveRank: defaultResolveRank
    });
    const newcal = makeVersion('Rubrics 1960 - 2020 USA', {
      name: 'rubrics-1960',
      resolveRank: defaultResolveRank
    });

    expect(matches('rubrica 1963', 'time-after-pentecost', monastic)).toBe(true);
    expect(matches('rubrica Barroux', 'time-after-pentecost', monastic)).toBe(true);
    expect(matches('rubrica altovadensis', 'time-after-pentecost', cistercian)).toBe(true);
    expect(matches('rubrica cisterciensisa', 'time-after-pentecost', cistercian)).toBe(true);
    expect(matches('rubrica praedicatorum', 'time-after-pentecost', dominican)).toBe(true);
    expect(matches('rubrica Newcal', 'time-after-pentecost', newcal)).toBe(true);
  });
});

function matches(
  expression: string,
  season: Parameters<typeof conditionMatches>[1]['season'],
  version: ResolvedVersion
): boolean {
  return conditionMatches(parseCondition(expression), {
    date: { year: 2024, month: 7, day: 14 },
    dayOfWeek: 0,
    season,
    version
  });
}

function makeVersion(handle: string, policy: RubricalPolicy): ResolvedVersion {
  return {
    handle: asVersionHandle(handle),
    kalendar: 'test',
    transfer: 'test',
    stransfer: 'test',
    policy
  };
}
