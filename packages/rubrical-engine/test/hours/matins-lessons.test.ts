import { parseFile } from '@officium-nova/parser';
import { describe, expect, it } from 'vitest';

import {
  routeLesson,
  asVersionHandle,
  type Celebration,
  type CelebrationRuleSet,
  type Commemoration,
  type LessonIndex,
  type ResolvedVersion,
  type TemporalContext
} from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';

const version: ResolvedVersion = {
  handle: asVersionHandle('Rubrics 1960 - 1960'),
  kalendar: '1960',
  transfer: '1960',
  stransfer: '1960',
  policy: makeTestPolicy('rubrics-1960')
};

describe('routeLesson', () => {
  it('maps explicit Lectio1=OctNat override to scripture octava-nativitatis', () => {
    const warnings: ReturnType<typeof warningsBuffer> = [];
    const source = routeLesson(1, {
      ...baseContext({
        warnings,
        celebrationRules: {
          ...baseRuleSet(),
          lessonSources: [{ lesson: 1, source: 'OctNat' }]
        }
      })
    });

    expect(source.kind).toBe('scripture');
    if (source.kind === 'scripture') {
      expect(source.course).toBe('octava-nativitatis');
    }
  });

  it("maps 'commemorated-principal' to commemorated lesson source", () => {
    const commemorations: readonly Commemoration[] = [
      {
        feastRef: {
          path: 'Sancti/04-14',
          id: 'Sancti/04-14',
          title: 'S. Commemorated'
        },
        rank: {
          name: 'III classis',
          classSymbol: 'III',
          weight: 500
        },
        reason: 'occurrence-impeded',
        hours: ['lauds', 'vespers']
      }
    ];

    const source = routeLesson(9, {
      ...baseContext({
        commemorations,
        celebrationRules: {
          ...baseRuleSet(),
          lessonSources: [{ lesson: 9, source: 'commemorated-principal' }]
        },
        shape: {
          nocturns: 3,
          totalLessons: 9,
          lessonsPerNocturn: [3, 3, 3]
        },
        nocturnIndex: 3
      })
    });

    expect(source.kind).toBe('commemorated');
    if (source.kind === 'commemorated') {
      expect(source.feast.path).toBe('Sancti/04-14');
      expect(source.lessonIndex).toBe(9);
    }
  });

  it('uses positional defaults for 9-lesson Matins: scripture -> hagiographic -> homily', () => {
    const scriptural = routeLesson(1, {
      ...baseContext({
        shape: { nocturns: 3, totalLessons: 9, lessonsPerNocturn: [3, 3, 3] },
        nocturnIndex: 1,
        feastFile: parseFile('[Lectio1]\nText', 'horas/Latin/Sancti/08-15.txt')
      })
    });
    const hagiographic = routeLesson(4, {
      ...baseContext({
        shape: { nocturns: 3, totalLessons: 9, lessonsPerNocturn: [3, 3, 3] },
        nocturnIndex: 2,
        feastFile: parseFile('[Lectio4]\nText', 'horas/Latin/Sancti/08-15.txt')
      })
    });
    const homily = routeLesson(7, {
      ...baseContext({
        shape: { nocturns: 3, totalLessons: 9, lessonsPerNocturn: [3, 3, 3] },
        nocturnIndex: 3,
        feastFile: parseFile('[Lectio7]\nText', 'horas/Latin/Sancti/08-15.txt')
      })
    });

    expect(scriptural.kind).toBe('scripture');
    expect(hagiographic.kind).toBe('hagiographic');
    expect(homily.kind).toBe('homily-on-gospel');
  });

  it('emits matins-lesson-unresolved warning when required lesson section is missing', () => {
    const warnings: ReturnType<typeof warningsBuffer> = [];

    routeLesson(4, {
      ...baseContext({
        warnings,
        shape: { nocturns: 3, totalLessons: 9, lessonsPerNocturn: [3, 3, 3] },
        nocturnIndex: 2,
        feastFile: parseFile('[Officium]\nTest', 'horas/Latin/Sancti/08-15.txt')
      })
    });

    expect(warnings.some((warning) => warning.code === 'matins-lesson-unresolved')).toBe(true);
  });

  it('emits a single missing-section warning for unresolved nocturn-2 lessons', () => {
    const warnings: ReturnType<typeof warningsBuffer> = [];

    routeLesson(4, {
      ...baseContext({
        warnings,
        shape: { nocturns: 3, totalLessons: 9, lessonsPerNocturn: [3, 3, 3] },
        nocturnIndex: 2,
        feastFile: parseFile('[Officium]\nTest', 'horas/Latin/Sancti/08-15.txt')
      })
    });

    const missingSectionWarnings = warnings.filter(
      (warning) => warning.code === 'matins-skeleton-missing-section'
    );
    expect(missingSectionWarnings).toHaveLength(1);
  });
});

function baseContext(overrides: Partial<Parameters<typeof routeLesson>[1]> = {}) {
  const temporal = temporalContext('2024-08-15', 'Pent11-4');
  const celebration = celebrationRef('Sancti/08-15', 'I');

  return {
    celebration,
    celebrationRules: baseRuleSet(),
    commemorations: [] as readonly Commemoration[],
    temporal,
    policy: makeTestPolicy('rubrics-1960'),
    defaultCourse: 'post-pentecost' as const,
    nocturnIndex: 1 as const,
    shape: {
      nocturns: 1 as const,
      totalLessons: 3 as const,
      lessonsPerNocturn: [3]
    },
    selectedAlternate: { location: 1 as const },
    feastFile: parseFile('[Lectio1]\nText', 'horas/Latin/Sancti/08-15.txt'),
    version,
    warnings: warningsBuffer(),
    ...overrides
  };
}

function baseRuleSet(): CelebrationRuleSet {
  return {
    matins: {
      lessonCount: 9,
      nocturns: 3,
      rubricGate: 'always'
    },
    hasFirstVespers: true,
    hasSecondVespers: true,
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

function celebrationRef(path: string, classSymbol: string): Celebration {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: 1000
    },
    source: path.startsWith('Tempora/') ? 'temporal' : 'sanctoral'
  };
}

function temporalContext(date: string, dayName: string): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: 'time-after-pentecost',
    feastRef: {
      path: `Tempora/${dayName}`,
      id: `Tempora/${dayName}`,
      title: dayName
    },
    rank: {
      name: 'IV classis',
      classSymbol: 'IV',
      weight: 100
    }
  };
}

function warningsBuffer() {
  return [] as Array<{
    readonly code: string;
    readonly message: string;
    readonly severity: 'info' | 'warn' | 'error';
    readonly context?: Readonly<Record<string, string>>;
  }>;
}

function toLessonIndex(value: number): LessonIndex {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }
  if (value === 7 || value === 8 || value === 9 || value === 10 || value === 11 || value === 12) {
    return value;
  }
  return 12;
}

void toLessonIndex;
