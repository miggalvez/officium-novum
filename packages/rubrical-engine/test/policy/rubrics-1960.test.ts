import { describe, expect, it } from 'vitest';

import {
  rubrics1960Policy,
  type Candidate,
  type Celebration,
  type CelebrationRuleSet,
  type ClassSymbol1960,
  type HourRuleSet,
  type TemporalContext
} from '../../src/index.js';

describe('rubrics1960Policy.resolveRank', () => {
  it('normalizes representative corpus ranks into 1960 classes', () => {
    const firstClass = rubrics1960Policy.resolveRank(
      { name: 'Duplex I classis', classWeight: 6.5 },
      context('2024-08-15', 'Sancti/08-15', 'sanctoral')
    );
    const secondClass = rubrics1960Policy.resolveRank(
      { name: 'Duplex II classis', classWeight: 5.1 },
      context('2024-09-14', 'Sancti/09-14', 'sanctoral')
    );
    const thirdClass = rubrics1960Policy.resolveRank(
      { name: 'Duplex', classWeight: 3 },
      context('2024-10-07', 'Sancti/10-07', 'sanctoral')
    );
    const fourthClass = rubrics1960Policy.resolveRank(
      { name: 'Simplex', classWeight: 1.1 },
      context('2024-10-11', 'Sancti/10-11', 'sanctoral')
    );
    const septemberEmber = rubrics1960Policy.resolveRank(
      { name: 'Feria', classWeight: 1 },
      context('2024-09-18', 'Tempora/Pent17-3', 'temporal', 'time-after-pentecost')
    );
    const postPentecostFeria = rubrics1960Policy.resolveRank(
      { name: 'Feria', classWeight: 1 },
      context('2024-05-29', 'Tempora/Pent01-3', 'temporal', 'time-after-pentecost')
    );
    const pentecostEmber = rubrics1960Policy.resolveRank(
      { name: 'Semiduplex I classis', classWeight: 6 },
      context('2024-05-22', 'Tempora/Pasc7-3', 'temporal', 'pentecost-octave')
    );

    expect(firstClass.classSymbol).toBe('I');
    expect(secondClass.classSymbol).toBe('II');
    expect(thirdClass.classSymbol).toBe('III');
    expect(fourthClass.classSymbol).toBe('IV');
    expect(septemberEmber.classSymbol).toBe('II-ember-day');
    expect(postPentecostFeria.classSymbol).toBe('IV');
    expect(pentecostEmber.classSymbol).toBe('I');
  });

  it('assigns privileged temporal classes for Triduum and privileged feriae', () => {
    const triduum = rubrics1960Policy.resolveRank(
      { name: 'Feria privilegiata', classWeight: 7 },
      context('2024-03-29', 'Tempora/Quad6-5', 'temporal', 'passiontide')
    );
    const ashWednesday = rubrics1960Policy.resolveRank(
      { name: 'Feria privilegiata', classWeight: 7 },
      context('2024-02-14', 'Tempora/Quadp3-3', 'temporal', 'septuagesima')
    );
    const privilegedSunday = rubrics1960Policy.resolveRank(
      { name: 'Semiduplex I classis', classWeight: 6.9 },
      context('2024-03-24', 'Tempora/Quad6-0', 'temporal', 'passiontide')
    );
    const septuagesimaSunday = rubrics1960Policy.resolveRank(
      { name: 'Semiduplex', classWeight: 5 },
      context('2024-01-28', 'Tempora/Quadp1-0', 'temporal', 'septuagesima')
    );

    expect(triduum.classSymbol).toBe('I-privilegiata-triduum');
    expect(ashWednesday.classSymbol).toBe('I-privilegiata-ash-wednesday');
    expect(privilegedSunday.classSymbol).toBe('I-privilegiata-sundays');
    expect(septuagesimaSunday.classSymbol).toBe('II');
  });
});

describe('rubrics1960Policy.applySeasonPreemption', () => {
  it('suppresses all sanctoral candidates in the Sacred Triduum', () => {
    const temporalContext = temporal('2024-03-29', 'Quad6-5', 'passiontide');
    const candidates = [
      candidate('Tempora/Quad6-5', 'temporal', 'I-privilegiata-triduum'),
      candidate('Sancti/03-25', 'sanctoral', 'I'),
      candidate('Sancti/03-19', 'sanctoral', 'I')
    ] as const;

    const preempted = rubrics1960Policy.applySeasonPreemption(candidates, temporalContext);

    expect(preempted.kept.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Quad6-5']);
    expect(preempted.suppressed.map((entry) => entry.candidate.feastRef.path)).toEqual([
      'Sancti/03-25',
      'Sancti/03-19'
    ]);
  });

  it('leaves candidates untouched outside the Triduum', () => {
    const temporalContext = temporal('2024-04-14', 'Pasc2-0', 'eastertide');
    const candidates = [
      candidate('Tempora/Pasc2-0', 'temporal', 'II'),
      candidate('Sancti/04-14', 'sanctoral', 'I')
    ] as const;

    const preempted = rubrics1960Policy.applySeasonPreemption(candidates, temporalContext);

    expect(preempted.kept).toEqual(candidates);
    expect(preempted.suppressed).toEqual([]);
  });
});

describe('rubrics1960Policy.compareCandidates', () => {
  it('orders by precedence weight descending', () => {
    const first = candidate('Sancti/04-14', 'sanctoral', 'I');
    const second = candidate('Tempora/Pasc2-0', 'temporal', 'II');
    expect(rubrics1960Policy.compareCandidates(first, second)).toBeLessThan(0);
    expect(rubrics1960Policy.compareCandidates(second, first)).toBeGreaterThan(0);
  });

  it('prefers temporal on equal rank as the deterministic tie-break', () => {
    const temporalCandidate = candidate('Tempora/Pasc2-1', 'temporal', 'III');
    const sanctoralCandidate = candidate('Sancti/07-17', 'sanctoral', 'III');
    expect(rubrics1960Policy.compareCandidates(temporalCandidate, sanctoralCandidate)).toBeLessThan(
      0
    );
  });

  it('allows privileged Sunday displacement only for the Dec 8 exception and first-class feasts of the Lord', () => {
    const privilegedSunday = candidate('Tempora/Adv2-0', 'temporal', 'I-privilegiata-sundays');
    const immaculate = candidate('Sancti/12-08', 'sanctoral', 'I');
    const stJoseph = candidate('Sancti/03-19', 'sanctoral', 'I');

    expect(rubrics1960Policy.compareCandidates(privilegedSunday, immaculate)).toBeGreaterThan(0);
    expect(rubrics1960Policy.compareCandidates(privilegedSunday, stJoseph)).toBeLessThan(0);
  });

  it('lets first- and second-class feasts of the Lord replace second-class Sundays', () => {
    const secondClassSunday = candidate('Tempora/Quadp1-0', 'temporal', 'II');
    const secondClassLordFeast = candidate('Sancti/08-06', 'sanctoral', 'II');
    const secondClassSaint = candidate('Sancti/09-08', 'sanctoral', 'II');

    expect(
      rubrics1960Policy.compareCandidates(secondClassSunday, secondClassLordFeast)
    ).toBeGreaterThan(0);
    expect(
      rubrics1960Policy.compareCandidates(secondClassLordFeast, secondClassSunday)
    ).toBeLessThan(0);
    expect(
      rubrics1960Policy.compareCandidates(secondClassSunday, secondClassSaint)
    ).toBeLessThan(0);
  });
});

describe('rubrics1960Policy.isPrivilegedFeria', () => {
  it.each([
    ['2024-02-14', 'Quadp3-3', true],
    ['2024-03-25', 'Quad6-1', true],
    ['2024-03-26', 'Quad6-2', true],
    ['2024-03-27', 'Quad6-3', true],
    ['2024-12-24', 'Adv4-2', true],
    ['2024-05-06', 'Pasc5-1', false],
    ['2024-04-14', 'Pasc2-0', false]
  ] as const)('%s (%s) -> %s', (date, dayName, expected) => {
    expect(rubrics1960Policy.isPrivilegedFeria(temporal(date, dayName, season(dayName)))).toBe(
      expected
    );
  });
});

describe('rubrics1960Policy.selectPsalmody', () => {
  it('models Eastertide III-class sanctoral weekday Lauds as ferial psalms with a whole-slot Paschal Alleluia antiphon', () => {
    const psalms = rubrics1960Policy.selectPsalmody({
      hour: 'lauds',
      celebration: matinsCelebration('Sancti/04-28', 'III', 'sanctoral'),
      celebrationRules: matinsRules(),
      hourRules: hourRules({ psalterScheme: 'dominica' }),
      temporal: temporal('2026-04-28', 'Pasc3-2', 'eastertide', 'IV'),
      corpus: {} as never
    });

    expect(psalms[0]?.psalmRef).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
      section: 'Day2 Laudes1',
      selector: '1'
    });
    expect(psalms.every((assignment) => assignment.antiphonRef === psalms[0]?.antiphonRef)).toBe(
      true
    );
    expect(psalms[0]?.antiphonRef).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
      section: 'Pasch',
      selector: '1'
    });
  });

  it('does not attach the Paschal Lauds antiphon outside Eastertide', () => {
    const psalms = rubrics1960Policy.selectPsalmody({
      hour: 'lauds',
      celebration: matinsCelebration('Sancti/08-19', 'III', 'sanctoral'),
      celebrationRules: matinsRules(),
      hourRules: hourRules({ psalterScheme: 'dominica' }),
      temporal: temporal('2024-08-19', 'Pent13-1', 'time-after-pentecost', 'IV'),
      corpus: {} as never
    });

    expect(psalms[0]?.psalmRef).toMatchObject({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
      section: 'Day1 Laudes1',
      selector: '1'
    });
    expect(psalms.map((assignment) => assignment.antiphonRef)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    ]);
  });

  it('uses the whole-slot Paschal Alleluia antiphon for temporal Eastertide Sunday major hours', () => {
    for (const hour of ['lauds', 'vespers'] as const) {
      const psalms = rubrics1960Policy.selectPsalmody({
        hour,
        celebration: matinsCelebration('Tempora/Pasc4-0', 'II', 'temporal'),
        celebrationRules: matinsRules(),
        hourRules: hourRules({ hour, psalterScheme: 'ferial' }),
        temporal: temporal('2026-05-03', 'Pasc4-0', 'eastertide', 'II'),
        corpus: {} as never
      });

      expect(psalms).toHaveLength(5);
      expect(psalms.every((assignment) => assignment.antiphonRef === psalms[0]?.antiphonRef)).toBe(
        true
      );
      expect(psalms[0]?.antiphonRef).toEqual({
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Pasch',
        selector: '1'
      });
    }
  });
});

describe('rubrics1960Policy.transferTarget', () => {
  it('walks past Holy Week before selecting the first allowed date', () => {
    const impeded = candidate('Sancti/03-25', 'sanctoral', 'I');
    const fromDate = { year: 2024, month: 3, day: 24 } as const;
    const until = { year: 2024, month: 4, day: 5 } as const;
    const byDate: Readonly<Record<string, TemporalContext>> = {
      '2024-03-25': temporal('2024-03-25', 'Quad6-1', 'passiontide'),
      '2024-03-26': temporal('2024-03-26', 'Quad6-2', 'passiontide'),
      '2024-03-27': temporal('2024-03-27', 'Quad6-3', 'passiontide'),
      '2024-03-28': temporal('2024-03-28', 'Quad6-4', 'passiontide'),
      '2024-03-29': temporal('2024-03-29', 'Quad6-5', 'passiontide'),
      '2024-03-30': temporal('2024-03-30', 'Quad6-6', 'passiontide'),
      '2024-03-31': temporal('2024-03-31', 'Pasc0-0', 'eastertide'),
      '2024-04-01': temporal('2024-04-01', 'Pasc0-1', 'eastertide')
    };

    const target = rubrics1960Policy.transferTarget(
      impeded,
      fromDate,
      until,
      (date) => byDate[toIso(date)] ?? temporal('2024-04-02', 'Pasc0-2', 'eastertide'),
      () => ({}),
      () => []
    );

    expect(target).toEqual({ year: 2024, month: 3, day: 31 });
  });
});

describe('rubrics1960Policy.resolveMatinsShape', () => {
  it('collapses unprivileged ferias to 1 nocturn x 3 lessons', () => {
    const shape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Pent07-2', 'IV', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV'),
      commemorations: []
    });

    expect(shape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });

  it('uses 1x3 Matins for Sunday offices and III-class feasts, while I-class feasts keep 3x3', () => {
    const sundayShape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration(
        'Tempora/Quad2-0',
        'I-privilegiata-sundays',
        'temporal'
      ),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-02-25', 'Quad2-0', 'lent'),
      commemorations: []
    });
    expect(sundayShape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    const thirdClassFeast = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Sancti/08-19', 'III', 'sanctoral'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-08-19', 'Pent13-1', 'time-after-pentecost'),
      commemorations: []
    });
    expect(thirdClassFeast).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    const feastShape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Sancti/08-15', 'I', 'sanctoral'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-08-15', 'Pent12-4', 'time-after-pentecost'),
      commemorations: []
    });
    expect(feastShape).toEqual({
      nocturns: 3,
      totalLessons: 9,
      lessonsPerNocturn: [3, 3, 3]
    });
  });

  it('honors explicit one-nocturn rule directives before class defaults', () => {
    const shape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Pasc0-0', 'I', 'temporal'),
      celebrationRules: matinsRules({
        matins: { lessonCount: 3, nocturns: 1, rubricGate: 'always' }
      }),
      temporal: temporal('2024-03-31', 'Pasc0-0', 'eastertide', 'I'),
      commemorations: []
    });

    expect(shape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });

  it('keeps Low Sunday in the privileged Paschal one-nocturn shape', () => {
    const shape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Pasc1-0', 'I', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-04-07', 'Pasc1-0', 'eastertide', 'I'),
      commemorations: []
    });

    expect(shape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });

  it('collapses Ash Wednesday and Holy Week feriae to 1 nocturn x 3 lessons', () => {
    const ashWednesday = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration(
        'Tempora/Quadp3-3',
        'I-privilegiata-ash-wednesday',
        'temporal'
      ),
      celebrationRules: matinsRules(),
      temporal: temporal(
        '2024-02-14',
        'Quadp3-3',
        'septuagesima',
        'I-privilegiata-ash-wednesday'
      ),
      commemorations: []
    });

    expect(ashWednesday).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    const holyWeekWednesday = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration(
        'Tempora/Quad6-3',
        'I-privilegiata-holy-week-feria',
        'temporal'
      ),
      celebrationRules: matinsRules(),
      temporal: temporal(
        '2024-03-27',
        'Quad6-3',
        'passiontide',
        'I-privilegiata-holy-week-feria'
      ),
      commemorations: []
    });

    expect(holyWeekWednesday).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });

  it('keeps Christmas temporal proper at 3x3 despite class-IV fallback rank', () => {
    const shape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Nat25', 'IV', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-12-25', 'Nat25', 'christmastide'),
      commemorations: []
    });

    expect(shape).toEqual({
      nocturns: 3,
      totalLessons: 9,
      lessonsPerNocturn: [3, 3, 3]
    });
  });

  it('collapses September Ember Saturday to 1 nocturn x 3 lessons', () => {
    const shape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Pent17-6', 'II-ember-day', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-09-21', 'Pent17-6', 'time-after-pentecost'),
      commemorations: []
    });

    expect(shape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });

  it('collapses Advent and Lenten Ember Saturdays to 1 nocturn x 3 lessons', () => {
    const adventShape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Adv3-6', 'II-ember-day', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-12-21', 'Adv3-6', 'advent', 'II-ember-day'),
      commemorations: []
    });

    expect(adventShape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });

    const lentShape = rubrics1960Policy.resolveMatinsShape({
      celebration: matinsCelebration('Tempora/Quad1-6', 'II-ember-day', 'temporal'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-02-24', 'Quad1-6', 'lent', 'II-ember-day'),
      commemorations: []
    });

    expect(lentShape).toEqual({
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    });
  });
});

describe('rubrics1960Policy.resolveTeDeum', () => {
  it('honors forced and suppressed overrides', () => {
    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebration: matinsCelebration('Tempora/Pent07-2', 'IV', 'temporal'),
        celebrationRules: {
          ...matinsRules(),
          teDeumOverride: 'forced'
        },
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost')
      })
    ).toBe('say');

    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 3, totalLessons: 9 },
        celebration: matinsCelebration('Sancti/08-15', 'I', 'sanctoral'),
        celebrationRules: {
          ...matinsRules(),
          teDeumOverride: 'suppressed'
        },
        temporal: temporal('2024-08-15', 'Pent12-4', 'time-after-pentecost')
      })
    ).toBe('omit');
  });

  it('omits Te Deum in Triduum, preserves it in the Paschal octave, and replaces it on other 3-lesson offices', () => {
    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 3, totalLessons: 9 },
        celebration: matinsCelebration('Tempora/Quad6-5', 'I', 'temporal'),
        celebrationRules: matinsRules(),
        temporal: temporal('2024-03-29', 'Quad6-5', 'passiontide')
      })
    ).toBe('omit');

    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebration: matinsCelebration('Tempora/Pasc0-2', 'I', 'temporal'),
        celebrationRules: matinsRules(),
        temporal: temporal('2024-04-02', 'Pasc0-2', 'eastertide', 'I')
      })
    ).toBe('say');

    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebration: matinsCelebration('Tempora/Pasc1-0', 'I', 'temporal'),
        celebrationRules: matinsRules(),
        temporal: temporal('2024-04-07', 'Pasc1-0', 'eastertide', 'I')
      })
    ).toBe('say');

    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebration: matinsCelebration('Tempora/Pent07-2', 'IV', 'temporal'),
        celebrationRules: matinsRules(),
        temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV')
      })
    ).toBe('replace-with-responsory');

    expect(
      rubrics1960Policy.resolveTeDeum({
        plan: { nocturns: 1, totalLessons: 3 },
        celebration: matinsCelebration('Sancti/04-29', 'III', 'sanctoral'),
        celebrationRules: matinsRules(),
        temporal: temporal('2026-04-29', 'Pasc3-3', 'eastertide', 'IV')
      })
    ).toBe('say');
  });
});

describe('rubrics1960Policy.defaultScriptureCourse', () => {
  it('maps seasonal contexts to the expected 1960 courses', () => {
    expect(
      rubrics1960Policy.defaultScriptureCourse(
        temporal('2024-12-25', 'Nat25', 'christmastide')
      )
    ).toBe('octava-nativitatis');

    expect(
      rubrics1960Policy.defaultScriptureCourse(
        temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost')
      )
    ).toBe('post-pentecost');
  });
});

describe('rubrics1960Policy.limitCommemorations', () => {
  it('drops fourth-class ferias and Saturday BVM from second-class commemorations', () => {
    const limited = rubrics1960Policy.limitCommemorations(
      [
        commemoration('Tempora/Pent13-4', 'IV'),
        commemoration('Sancti/08-22cc', 'IV'),
        commemoration('Commune/C10', 'III')
      ],
      {
        hour: 'lauds',
        temporal: temporal('2024-08-22', 'Pent13-4', 'time-after-pentecost', 'IV'),
        celebration: matinsCelebration('Sancti/08-22', 'II', 'sanctoral'),
        celebrationRules: matinsRules(),
        winnerSource: 'occurrence'
      }
    );

    expect(limited.map((entry) => entry.feastRef.path)).toEqual(['Sancti/08-22cc']);
  });

  it('admits only the second-class feast on a second-class Sunday', () => {
    const limited = rubrics1960Policy.limitCommemorations(
      [commemoration('Sancti/09-08', 'II'), commemoration('Sancti/09-08cc', 'IV')],
      {
        hour: 'lauds',
        temporal: temporal('2024-09-08', 'Pent16-0', 'time-after-pentecost', 'II'),
        celebration: matinsCelebration('Tempora/Pent16-0', 'II', 'temporal'),
        celebrationRules: matinsRules(),
        winnerSource: 'occurrence'
      }
    );

    expect(limited.map((entry) => entry.feastRef.path)).toEqual(['Sancti/09-08']);
  });

  it('suppresses the Sunday commemoration when a feast of the Lord replaces a second-class Sunday', () => {
    const limited = rubrics1960Policy.limitCommemorations(
      [commemoration('Tempora/Quadp1-0', 'II'), commemoration('Sancti/09-08', 'II')],
      {
        hour: 'lauds',
        temporal: temporal('2024-01-28', 'Quadp1-0', 'septuagesima', 'II'),
        celebration: matinsCelebration('Sancti/08-06', 'II', 'sanctoral'),
        celebrationRules: matinsRules(),
        winnerSource: 'occurrence'
      }
    );

    expect(limited.map((entry) => entry.feastRef.path)).toEqual(['Sancti/09-08']);
  });

  it('admits no commemorations on the first-class Vigil of Christmas', () => {
    const limited = rubrics1960Policy.limitCommemorations(
      [commemoration('Tempora/Adv4-2', 'II')],
      {
        hour: 'lauds',
        temporal: temporal(
          '2024-12-24',
          'Adv4-2',
          'advent',
          'I-privilegiata-christmas-vigil'
        ),
        celebration: {
          ...matinsCelebration('Sancti/12-24', 'I-privilegiata-christmas-vigil', 'sanctoral'),
          kind: 'vigil'
        },
        celebrationRules: matinsRules(),
        winnerSource: 'occurrence'
      }
    );

    expect(limited).toEqual([]);
  });
});

describe('rubrics1960Policy commemoration-Hour hooks', () => {
  it('defaults commemoration Hours to Lauds and Vespers only (RI §106–109)', () => {
    expect(rubrics1960Policy.defaultCommemorationHours()).toEqual(['lauds', 'vespers']);
  });

  it('does not commemorate at Matins, minor Hours, or Compline', () => {
    const context = {
      celebration: matinsCelebration('Sancti/08-22', 'II', 'sanctoral'),
      celebrationRules: matinsRules(),
      temporal: temporal('2024-08-22', 'Pent13-4', 'time-after-pentecost', 'IV')
    };
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'lauds', ...context })).toBe(true);
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'vespers', ...context })).toBe(true);
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'matins', ...context })).toBe(false);
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'prime', ...context })).toBe(false);
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'terce', ...context })).toBe(false);
    expect(rubrics1960Policy.commemoratesAtHour({ hour: 'compline', ...context })).toBe(false);
  });
});

function context(
  date: string,
  feastPath: string,
  source: 'temporal' | 'sanctoral',
  seasonName: TemporalContext['season'] = 'time-after-pentecost'
) {
  return {
    date,
    feastPath,
    source,
    version: 'Rubrics 1960 - 1960',
    season: seasonName
  } as const;
}

function temporal(
  date: string,
  dayName: string,
  seasonName: TemporalContext['season'],
  classSymbol: ClassSymbol1960 = 'II'
): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season: seasonName,
    feastRef: {
      path: `Tempora/${dayName}`,
      id: `Tempora/${dayName}`,
      title: dayName
    },
    rank: rank(classSymbol)
  };
}

function matinsRules(overrides: Partial<CelebrationRuleSet> = {}): CelebrationRuleSet {
  return {
    matins: { lessonCount: 9, nocturns: 3, rubricGate: 'always' },
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
    hourScopedDirectives: [],
    ...overrides
  };
}

function hourRules(overrides: Partial<HourRuleSet> = {}): HourRuleSet {
  return {
    hour: 'lauds',
    omit: [],
    psalterScheme: 'ferial',
    psalmOverrides: [],
    matinsLessonIntroduction: 'ordinary',
    minorHoursSineAntiphona: false,
    minorHoursFerialPsalter: false,
    ...overrides
  };
}

function matinsCelebration(
  path: string,
  classSymbol: string,
  source: Celebration['source']
): Celebration {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classSymbol === 'IV' ? 100 : 1000
    },
    source
  };
}

function candidate(path: string, source: Candidate['source'], classSymbol: ClassSymbol1960): Candidate {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: rank(classSymbol),
    source
  };
}

function commemoration(path: string, classSymbol: ClassSymbol1960 | 'II'): {
  readonly feastRef: { readonly path: string; readonly id: string; readonly title: string };
  readonly rank: ReturnType<typeof rank> | { readonly name: 'II'; readonly classSymbol: 'II'; readonly weight: number };
  readonly reason: 'occurrence-impeded';
  readonly hours: readonly ['lauds'];
} {
  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: classSymbol === 'II' ? rank('II') : rank(classSymbol),
    reason: 'occurrence-impeded',
    hours: ['lauds']
  };
}

function rank(classSymbol: ClassSymbol1960) {
  const row = rubrics1960Policy.precedenceRow(classSymbol);
  return {
    name: classSymbol,
    classSymbol,
    weight: row.weight
  } as const;
}

function season(dayName: string): TemporalContext['season'] {
  if (dayName.startsWith('Adv')) {
    return 'advent';
  }
  if (dayName.startsWith('Quadp')) {
    return 'septuagesima';
  }
  if (dayName.startsWith('Quad5') || dayName.startsWith('Quad6')) {
    return 'passiontide';
  }
  if (dayName.startsWith('Quad')) {
    return 'lent';
  }
  if (dayName.startsWith('Pasc')) {
    return 'eastertide';
  }
  return 'time-after-pentecost';
}

function toIso(date: { readonly year: number; readonly month: number; readonly day: number }): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(
    date.day
  ).padStart(2, '0')}`;
}
