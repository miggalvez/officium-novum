import { parseFile } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  buildConcurrencePreview,
  rubrics1960Policy,
  type Celebration,
  type CelebrationRuleSet,
  type ClassSymbol1960,
  type DayConcurrencePreview
} from '../../src/index.js';

describe('buildConcurrencePreview', () => {
  it('captures celebration, celebrationRules, commemorations, and both Vespers classes', () => {
    const summary = makeSummary('2024-10-07', 'II');
    const preview = buildConcurrencePreview(
      { year: 2024, month: 10, day: 7 },
      {
        policy: rubrics1960Policy,
        resolveSummary() {
          return summary;
        },
        resolveFeastFile() {
          return properVespersFile();
        }
      }
    );

    expect(preview.date).toBe('2024-10-07');
    expect(preview.celebration.feastRef.path).toBe('Sancti/10-07');
    expect(preview.hasFirstVespers).toBe(true);
    expect(preview.hasSecondVespers).toBe(true);
    expect(preview.firstVespersClass).toBe('totum');
    expect(preview.secondVespersClass).toBe('totum');
    expect(preview.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Pent20-2']);
  });

  it('is deterministic under a per-date cache key (same date returns same object)', () => {
    const cache = new Map<string, DayConcurrencePreview>();
    let buildCount = 0;
    const date = { year: 2024, month: 10, day: 7 } as const;
    const key = 'Rubrics 1960 - 1960::2024-10-07';

    const first = getOrBuild();
    const second = getOrBuild();

    expect(first).toBe(second);
    expect(buildCount).toBe(1);

    function getOrBuild(): DayConcurrencePreview {
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      buildCount += 1;
      const built = buildConcurrencePreview(date, {
        policy: rubrics1960Policy,
        resolveSummary() {
          return makeSummary('2024-10-07', 'III');
        },
        resolveFeastFile() {
          return properVespersFile();
        }
      });
      cache.set(key, built);
      return built;
    }
  });
});

function makeSummary(
  isoDate: string,
  classSymbol: ClassSymbol1960
) {
  const celebration: Celebration = {
    feastRef: {
      path: 'Sancti/10-07',
      id: 'Sancti/10-07',
      title: 'S. Rosarii B.M.V.'
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classWeight(classSymbol)
    },
    source: 'sanctoral'
  };

  return {
    date: isoDate,
    temporal: {
      date: isoDate,
      dayOfWeek: new Date(`${isoDate}T00:00:00Z`).getUTCDay(),
      weekStem: 'Pent20',
      dayName: 'Pent20-2',
      season: 'time-after-pentecost',
      feastRef: {
        path: 'Tempora/Pent20-2',
        id: 'Tempora/Pent20-2',
        title: 'Feria III'
      },
      rank: {
        name: 'IV',
        classSymbol: 'IV',
        weight: 400
      }
    },
    celebration,
    celebrationRules: makeRuleSet(true, true),
    commemorations: [
      {
        feastRef: {
          path: 'Tempora/Pent20-2',
          id: 'Tempora/Pent20-2',
          title: 'Feria III'
        },
        rank: {
          name: 'IV',
          classSymbol: 'IV',
          weight: 400
        },
        reason: 'occurrence-impeded',
        hours: ['lauds', 'vespers']
      }
    ] as const
  } as const;
}

function classWeight(classSymbol: ClassSymbol1960): number {
  return (
    {
      'I-privilegiata-triduum': 1300,
      'I-privilegiata-sundays': 1250,
      'I-privilegiata-ash-wednesday': 1240,
      'I-privilegiata-holy-week-feria': 1230,
      'I-privilegiata-christmas-vigil': 1220,
      'I-privilegiata-rogation-monday': 1210,
      'II-ember-day': 850,
      I: 1000,
      II: 800,
      III: 600,
      'IV-lenten-feria': 450,
      IV: 400,
      'commemoration-only': 100
    } satisfies Record<ClassSymbol1960, number>
  )[classSymbol];
}

function properVespersFile() {
  return parseFile(
    [
      '[Officium]',
      'Festum test',
      '',
      '[Rank]',
      'Festum test;;Duplex II classis;;5;;',
      '',
      '[Ant Vespera]',
      'Antiphona test',
      '',
      '[Psalm Vespera]',
      'Psalmus test'
    ].join('\n'),
    'horas/Latin/Sancti/10-07.txt'
  );
}

function makeRuleSet(hasFirstVespers: boolean, hasSecondVespers: boolean): CelebrationRuleSet {
  return {
    matins: {
      lessonCount: 9,
      nocturns: 3,
      rubricGate: 'always'
    },
    hasFirstVespers,
    hasSecondVespers,
    lessonSources: [],
    lessonSetAlternates: [],
    festumDomini: false,
    conclusionMode: 'separate',
    antiphonScheme: 'default',
    omitCommemoration: false,
    noSuffragium: false,
    quorumFestum: false,
    commemoratio3: false,
    unaAntiphona: false,
    unmapped: [],
    hourScopedDirectives: []
  };
}
