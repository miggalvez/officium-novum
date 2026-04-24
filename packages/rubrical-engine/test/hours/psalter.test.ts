import { describe, expect, it } from 'vitest';

import {
  selectPsalmodyRoman1960,
  type Celebration,
  type CelebrationRuleSet,
  type HourRuleSet,
  type LiturgicalSeason,
  type TemporalContext
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';

function temporal(
  isoDate: string,
  dayName: string,
  season: LiturgicalSeason,
  dayOfWeek: number
): TemporalContext {
  return {
    date: isoDate,
    dayOfWeek,
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season,
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: { name: 'IV', classSymbol: 'IV', weight: 400 }
  };
}

function celebration(path: string): Celebration {
  return {
    feastRef: { path, id: path, title: path.split('/').at(-1) ?? path },
    rank: { name: 'IV', classSymbol: 'IV', weight: 400 },
    source: 'temporal'
  };
}

function baseCelebrationRules(): CelebrationRuleSet {
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
    hourScopedDirectives: []
  };
}

function hourRules(
  hour: HourRuleSet['hour'],
  overrides: Partial<HourRuleSet> = {}
): HourRuleSet {
  return {
    hour,
    omit: [],
    psalterScheme: 'ferial',
    psalmOverrides: [],
    matinsLessonIntroduction: 'ordinary',
    minorHoursSineAntiphona: false,
    minorHoursFerialPsalter: false,
    ...overrides
  };
}

function corpus() {
  return new TestOfficeTextIndex();
}

describe('selectPsalmodyRoman1960', () => {
  it('routes Sunday Vespers to five Day0 Vespera row selectors', () => {
    const refs = selectPsalmodyRoman1960({
      hour: 'vespers',
      celebration: celebration('Tempora/Pent03-0'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('vespers'),
      temporal: temporal('2024-06-09', 'Pent03-0', 'time-after-pentecost', 0),
      corpus: corpus()
    });

    expect(refs).toHaveLength(5);
    expect(refs[0]?.psalmRef.section).toBe('Day0 Vespera');
    expect(refs[0]?.psalmRef.selector).toBe('1');
    expect(refs[4]?.psalmRef.selector).toBe('5');
    expect(refs[0]?.psalmRef.path).toContain('Psalmi major');
  });

  it('emits Laudes I on festive days and Laudes II on penitential ferias', () => {
    const festive = selectPsalmodyRoman1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Pent03-0'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('2024-06-09', 'Pent03-0', 'time-after-pentecost', 0),
      corpus: corpus()
    });
    expect(festive).toHaveLength(5);
    expect(festive[0]?.psalmRef.section).toBe('Day0 Laudes1');
    expect(festive[0]?.psalmRef.selector).toBe('1');

    const penitential = selectPsalmodyRoman1960({
      hour: 'lauds',
      celebration: celebration('Tempora/Quad2-1'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('lauds'),
      temporal: temporal('2024-02-26', 'Quad2-1', 'lent', 1),
      corpus: corpus()
    });
    expect(penitential[0]?.psalmRef.section).toBe('Day1 Laudes2');
  });

  it('selects proper feast psalmody when psalterScheme is proper', () => {
    const refs = selectPsalmodyRoman1960({
      hour: 'vespers',
      celebration: celebration('Sancti/08-15'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('vespers', { psalterScheme: 'proper' }),
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      corpus: corpus()
    });

    expect(refs).toHaveLength(5);
    expect(refs[0]?.psalmRef.path).toBe('horas/Latin/Sancti/08-15');
    expect(refs[0]?.psalmRef.section).toBe('Psalmi Vespera');
    expect(refs[0]?.psalmRef.selector).toBe('1');
  });

  it('uses Sunday distribution on a weekday when psalterScheme is dominica (Codex P1 #4)', () => {
    // Assumption (2024-08-15) is a Thursday but its [Rule] says `Psalmi Dominica`.
    const refs = selectPsalmodyRoman1960({
      hour: 'vespers',
      celebration: celebration('Sancti/08-15'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('vespers', { psalterScheme: 'dominica' }),
      temporal: temporal('2024-08-15', 'Pent13-4', 'time-after-pentecost', 4),
      corpus: corpus()
    });

    expect(refs[0]?.psalmRef.section).toBe('Day0 Vespera');
  });

  it('psalm overrides replace only the targeted Vespers slot (Codex P1 #5)', () => {
    const refs = selectPsalmodyRoman1960({
      hour: 'vespers',
      celebration: celebration('Sancti/10-02'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('vespers', {
        psalmOverrides: [
          { key: 'Psalm5 Vespera', value: '116' },
          { key: 'Psalm5 Vespera3', value: '138' }
        ]
      }),
      temporal: temporal('2024-10-02', 'Pent19-3', 'time-after-pentecost', 3),
      corpus: corpus()
    });

    expect(refs).toHaveLength(5);
    expect(refs[0]?.psalmRef.section).toBe('Day3 Vespera');
    expect(refs[4]?.psalmRef.path).toBe(
      'horas/Latin/Psalterium/Psalmorum/Psalm116'
    );
    expect(refs[4]?.psalmRef.selector).toBe('116');
  });

  it('routes a minor hour (Sext) to Psalmi minor with weekday selector', () => {
    const refs = selectPsalmodyRoman1960({
      hour: 'sext',
      celebration: celebration('Tempora/Pent03-2'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('sext'),
      temporal: temporal('2024-06-11', 'Pent03-2', 'time-after-pentecost', 2),
      corpus: corpus()
    });

    expect(refs[0]?.psalmRef.section).toBe('Sexta');
    expect(refs[0]?.psalmRef.selector).toBe('Feria III');
  });

  it('splits weekday Prime rows and applies the bracketed-psalm rule', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Prima]
Feria IV = Misericórdia tua, * Dómine, ante óculos meos: et complácui in veritáte tua.
25,51,52,[96]
`.trim()
    );

    const pre1960Penitential = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Tempora/Quadp3-3'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime'),
      temporal: temporal('2024-02-14', 'Quadp3-3', 'lent', 3),
      corpus: textIndex
    });
    expect(pre1960Penitential.map((entry) => entry.psalmRef.selector)).toEqual([
      '25',
      '51',
      '52',
      '[96]'
    ]);
    expect(pre1960Penitential[0]?.antiphonRef?.selector).toBe('Feria IV#antiphon');

    const rubrics1960Penitential = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Tempora/Quadp3-3'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime'),
      temporal: temporal('2024-02-14', 'Quadp3-3', 'lent', 3),
      corpus: textIndex,
      omitPrimeBracketPsalm: true
    });
    expect(rubrics1960Penitential.map((entry) => entry.psalmRef.selector)).toEqual([
      '25',
      '51',
      '52'
    ]);

    const pre1960OrdinaryWeekday = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Tempora/Pent03-3'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime'),
      temporal: temporal('2024-06-12', 'Pent03-3', 'time-after-pentecost', 3),
      corpus: textIndex
    });
    expect(pre1960OrdinaryWeekday.map((entry) => entry.psalmRef.selector)).toEqual([
      '25',
      '51',
      '52'
    ]);
  });

  it('continues weekday minor-hour psalm lookup after conditional keyed rows', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Sexta]
(nisi rubrica praedicatorum) Feria IV = Misericórdia tua, * Dómine.
118(81-96),118(97-112)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'sext',
      celebration: celebration('Tempora/Quadp3-3'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('sext'),
      temporal: temporal('2024-02-14', 'Quadp3-3', 'lent', 3),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '118(81-96)',
      '118(97-112)'
    ]);
    expect(refs[0]?.antiphonRef?.selector).toBe('Feria IV#antiphon');
  });

  it('does not emit a minor-hour antiphon reference for underscore sentinels', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tertia]
Feria V = _
118(33-48),118(49-64)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'terce',
      celebration: celebration('Tempora/Pent03-4'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('terce'),
      temporal: temporal('2024-06-13', 'Pent03-4', 'time-after-pentecost', 4),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '118(33-48)',
      '118(49-64)'
    ]);
    expect(refs[0]?.antiphonRef).toBeUndefined();
  });

  it('uses the Tridentinum Prime festis table for weekday feasts with Psalmi Dominica', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tridentinum]
Prima Festis=Allelúja, * allelúja, allelúja;;53,118(1-16),118(17-32)
Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)
Sexta Dominica=Allelúja, * allelúja, allelúja;;118(81-96),118(97-112),118(113-128)
Nona Dominica=Allelúja, * allelúja, allelúja;;118(129-144),118(145-160),118(161-176)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Sancti/01-06'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime', { psalterScheme: 'dominica' }),
      temporal: temporal('2024-01-06', 'Nat06', 'christmastide', 6),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.path)).toEqual([
      'horas/Latin/Psalterium/Psalmorum/Psalm53',
      'horas/Latin/Psalterium/Psalmorum/Psalm118',
      'horas/Latin/Psalterium/Psalmorum/Psalm118'
    ]);
    expect(refs[0]?.antiphonRef?.selector).toBe('Prima Festis#antiphon');
    expect(refs[1]?.psalmRef.selector).toBe('118(1-16)');
  });

  it('drops the Tridentinum opening antiphon when Minores sine Antiphona still uses the festal Prime table', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tridentinum]
Prima Festis=Allelúja, * allelúja, allelúja;;53,118(1-16),118(17-32)
Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)
Sexta Dominica=Allelúja, * allelúja, allelúja;;118(81-96),118(97-112),118(113-128)
Nona Dominica=Allelúja, * allelúja, allelúja;;118(129-144),118(145-160),118(161-176)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Tempora/Pasc0-1'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime', {
        psalterScheme: 'dominica',
        minorHoursSineAntiphona: true
      }),
      temporal: temporal('2024-04-01', 'Pasc0-1', 'eastertide', 1),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '53',
      '118(1-16)',
      '118(17-32)'
    ]);
    expect(refs[0]?.antiphonRef).toBeUndefined();
  });

  it('keeps Prime on the Tridentinum festis table for Sunday feasts with proper minor-hour antiphons', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tridentinum]
Prima Dominica=Allelúja, * allelúja, allelúja;;53,117,118(1-16),118(17-32)
Prima Festis=Allelúja, * allelúja, allelúja;;53,118(1-16),118(17-32)
Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)
Sexta Dominica=Allelúja, * allelúja, allelúja;;118(81-96),118(97-112),118(113-128)
Nona Dominica=Allelúja, * allelúja, allelúja;;118(129-144),118(145-160),118(161-176)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Sancti/12-08'),
      celebrationRules: {
        ...baseCelebrationRules(),
        antiphonScheme: 'proper-minor-hours'
      },
      hourRules: hourRules('prime', { psalterScheme: 'dominica' }),
      temporal: temporal('2024-12-08', 'Adv2-0', 'advent', 0),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.path)).toEqual([
      'horas/Latin/Psalterium/Psalmorum/Psalm53',
      'horas/Latin/Psalterium/Psalmorum/Psalm118',
      'horas/Latin/Psalterium/Psalmorum/Psalm118'
    ]);
    expect(refs[0]?.antiphonRef?.selector).toBe('Prima Festis#antiphon');
    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '53',
      '118(1-16)',
      '118(17-32)'
    ]);
  });

  it('uses the Tridentinum Sunday minor-hour ranges on temporal Sundays', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tridentinum]
Prima Dominica=Allelúja, * allelúja, allelúja;;53,117,118(1-16),118(17-32)
Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)
Sexta Dominica=Allelúja, * allelúja, allelúja;;118(81-96),118(97-112),118(113-128)
Nona Dominica=Allelúja, * allelúja, allelúja;;118(129-144),118(145-160),118(161-176)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'terce',
      celebration: celebration('Tempora/Epi2-0'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('terce'),
      temporal: temporal('2024-01-14', 'Epi2-0', 'time-after-epiphany', 0),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '118(33-48)',
      '118(49-64)',
      '118(65-80)'
    ]);
    expect(refs[0]?.antiphonRef?.selector).toBe('Tertia Dominica#antiphon');
  });

  it('uses the Tridentinum SQP Prime row on Quad Sundays', () => {
    const textIndex = new TestOfficeTextIndex();
    textIndex.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      `
[Tridentinum]
Prima Dominica=Allelúja, * allelúja, allelúja;;53,117,118(1-16),118(17-32)
Prima Dominica SQP=;;53,92,118(1-16),118(17-32)
Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)
Sexta Dominica=Allelúja, * allelúja, allelúja;;118(81-96),118(97-112),118(113-128)
Nona Dominica=Allelúja, * allelúja, allelúja;;118(129-144),118(145-160),118(161-176)
`.trim()
    );

    const refs = selectPsalmodyRoman1960({
      hour: 'prime',
      celebration: celebration('Tempora/Quadp1-0'),
      celebrationRules: baseCelebrationRules(),
      hourRules: hourRules('prime'),
      temporal: temporal('2024-01-28', 'Quadp1-0', 'septuagesima', 0),
      corpus: textIndex
    });

    expect(refs.map((entry) => entry.psalmRef.selector)).toEqual([
      '53',
      '92',
      '118(1-16)',
      '118(17-32)'
    ]);
    expect(refs[0]?.antiphonRef).toBeUndefined();
  });
});
