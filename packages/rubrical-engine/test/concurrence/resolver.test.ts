import { describe, expect, it } from 'vitest';

import {
  resolveConcurrence,
  rubrics1960Policy,
  type Celebration,
  type CelebrationRuleSet,
  type ClassSymbol1960,
  type DayConcurrencePreview,
  type TemporalContext,
  type VespersClass
} from '../../src/index.js';

describe('resolveConcurrence', () => {
  it('keeps today when today outranks tomorrow and commemorates tomorrow at Vespers', () => {
    const today = makePreview('2024-08-15', 'I', 'totum');
    const tomorrow = makePreview('2024-08-16', 'II', 'totum');
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('today');
    expect(result.source.feastRef.path).toBe(today.celebration.feastRef.path);
    expect(result.reason).toBe('today-higher-rank');
    expect(result.commemorations).toHaveLength(1);
    expect(result.commemorations[0]).toMatchObject({
      feastRef: { path: tomorrow.celebration.feastRef.path },
      reason: 'concurrence',
      hours: ['vespers']
    });
  });

  it('hands Vespers to tomorrow when tomorrow outranks today', () => {
    const today = makePreview('2024-08-16', 'II', 'totum');
    const tomorrow = makePreview('2024-08-17', 'I', 'totum');
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('tomorrow');
    expect(result.source.feastRef.path).toBe(tomorrow.celebration.feastRef.path);
    expect(result.reason).toBe('tomorrow-higher-rank');
    expect(result.commemorations.map((entry) => entry.feastRef.path)).toEqual([
      today.celebration.feastRef.path
    ]);
  });

  it('applies praestantior on equal ranks (today wins tie)', () => {
    const today = makePreview('2024-07-01', 'I', 'totum');
    const tomorrow = makePreview('2024-07-02', 'I', 'totum');
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('today');
    expect(result.reason).toBe('equal-rank-praestantior');
    expect(result.warnings.some((warning) => warning.code === 'concurrence-praestantior-tie')).toBe(
      true
    );
  });

  it('honors no secunda Vespera before rank comparison', () => {
    const today = makePreview('2024-08-15', 'I', 'totum', {
      hasSecondVespers: false
    });
    const tomorrow = makePreview('2024-08-16', 'III', 'totum', {
      hasFirstVespers: true
    });
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('tomorrow');
    expect(result.reason).toBe('today-declines-second-vespers');
    expect(result.commemorations).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === 'concurrence-rule-veto')).toBe(true);
  });

  it('defaults to today when both sides are nihil', () => {
    const today = makePreview('2024-11-05', 'IV', 'nihil');
    const tomorrow = makePreview('2024-11-06', 'IV', 'nihil');
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('today');
    expect(result.reason).toBe('today-only-has-vespers');
    expect(result.commemorations).toEqual([]);
  });

  it('short-circuits during the Sacred Triduum', () => {
    const today = makePreview('2024-03-29', 'I-privilegiata-triduum', 'totum', {
      dayName: 'Quad6-5',
      source: 'temporal',
      path: 'Tempora/Quad6-5'
    });
    const tomorrow = makePreview('2024-03-30', 'I-privilegiata-triduum', 'totum', {
      dayName: 'Quad6-6',
      source: 'temporal',
      path: 'Tempora/Quad6-6'
    });
    const result = resolveConcurrence({
      today,
      tomorrow,
      temporal: today.temporal,
      policy: rubrics1960Policy
    });

    expect(result.winner).toBe('today');
    expect(result.reason).toBe('triduum-special');
    expect(result.commemorations).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === 'concurrence-triduum-special')).toBe(
      true
    );
  });
});

function makePreview(
  isoDate: string,
  classSymbol: ClassSymbol1960,
  vespersClass: VespersClass,
  options: {
    readonly hasFirstVespers?: boolean;
    readonly hasSecondVespers?: boolean;
    readonly dayName?: string;
    readonly source?: Celebration['source'];
    readonly path?: string;
  } = {}
): DayConcurrencePreview {
  const celebration = makeCelebration(
    options.path ?? `Sancti/${isoDate.slice(5).replace('-', '/')}`,
    classSymbol,
    options.source ?? 'sanctoral'
  );
  const rules = makeRuleSet(options.hasFirstVespers ?? true, options.hasSecondVespers ?? true);

  return {
    date: isoDate,
    temporal: makeTemporalContext(isoDate, options.dayName ?? 'Pent20-2', celebration),
    celebration,
    celebrationRules: rules,
    commemorations: [],
    firstVespersClass: vespersClass,
    secondVespersClass: vespersClass,
    hasFirstVespers: rules.hasFirstVespers,
    hasSecondVespers: rules.hasSecondVespers
  };
}

function makeTemporalContext(
  isoDate: string,
  dayName: string,
  celebration: Celebration
): TemporalContext {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return {
    date: isoDate,
    dayOfWeek: date.getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: 'time-after-pentecost',
    feastRef: celebration.feastRef,
    rank: celebration.rank
  };
}

function makeCelebration(path: string, classSymbol: ClassSymbol1960, source: Celebration['source']) {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classWeight(classSymbol)
    },
    source
  } as const satisfies Celebration;
}

function classWeight(classSymbol: ClassSymbol1960): number {
  return (
    {
      'I-privilegiata-triduum': 1300,
      'I-privilegiata-sundays': 1250,
      'I-privilegiata-ash-wednesday': 1240,
      'I-privilegiata-holy-week-feria': 1230,
      'I-privilegiata-christmas-vigil': 1220,
      'II-ember-day': 790,
      I: 1000,
      II: 800,
      III: 600,
      'IV-lenten-feria': 450,
      IV: 400,
      'commemoration-only': 100
    } satisfies Record<ClassSymbol1960, number>
  )[classSymbol];
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
    specialConclusion: false,
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
