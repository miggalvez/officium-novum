import { describe, expect, it } from 'vitest';

import {
  buildMatinsPlanWithWarnings,
  type Celebration,
  type CelebrationRuleSet,
  type HourRuleSet,
  type TemporalContext
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';
import { rubrics1960Policy } from '../../src/policy/rubrics-1960.js';

const HOUR_RULES: HourRuleSet = {
  hour: 'matins',
  omit: [],
  psalterScheme: 'ferial',
  psalmOverrides: [],
  minorHoursSineAntiphona: false,
  minorHoursFerialPsalter: false
};

describe('buildMatinsPlan', () => {
  it('builds 1-nocturn ferial Matins with Te Deum replaced by final responsory', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pent07-2.txt', ferialMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pent07-2', 'IV', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturns).toBe(1);
    expect(result.plan.totalLessons).toBe(3);
    expect(result.plan.teDeum).toBe('replace-with-responsory');
    const replaced = result.plan.nocturnPlan[0]?.responsories[2];
    expect(replaced?.replacesTeDeum).toBe(true);
  });

  it('builds Advent Sunday as 3 nocturns with Te Deum said', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Adv1-0.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Adv1-0', 'I-privilegiata-sundays', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-01', 'Adv1-0', 'advent', 'I-privilegiata-sundays'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturns).toBe(3);
    expect(result.plan.totalLessons).toBe(9);
    expect(result.plan.teDeum).toBe('say');
    expect(result.plan.nocturnPlan.map((nocturn) => nocturn.antiphons.length)).toEqual([
      3, 3, 3
    ]);
    expect(result.plan.nocturnPlan.map((nocturn) => nocturn.psalmody.length)).toEqual([
      3, 3, 3
    ]);
    for (const nocturn of result.plan.nocturnPlan) {
      expect(nocturn.versicle.reference.path).toBe(
        'horas/Latin/Psalterium/Psalmi/Psalmi matutinum'
      );
      expect(nocturn.versicle.reference.section).toBe('Day0');
    }
  });

  it('keeps festal hymn metadata (doxology variant) on I-class feast', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/08-15.txt', festalMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/08-15', 'I', 'sanctoral'),
      celebrationRules: {
        ...baseRules(),
        doxologyVariant: 'Nat'
      },
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-08-15', 'Pent11-4', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturns).toBe(3);
    expect(result.plan.totalLessons).toBe(9);
    expect(result.plan.hymn.kind).toBe('feast');
    if (result.plan.hymn.kind === 'feast') {
      expect(result.plan.hymn.doxologyVariant).toBe('Nat');
    }
  });

  it('honors forced Te Deum override on an otherwise ferial day', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pent07-2.txt', ferialMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pent07-2', 'IV', 'temporal'),
      celebrationRules: {
        ...baseRules(),
        teDeumOverride: 'forced'
      },
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.teDeum).toBe('say');
  });

  it("keeps ferial Te Deum replacement when scripture-transfer 'A' appends a lesson", () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pent07-2.txt', ferialMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pent07-2', 'IV', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      overlayScriptureTransfer: {
        dateKey: '07-09',
        target: 'Pent07-0',
        operation: 'A'
      }
    });

    expect(result.plan.totalLessons).toBe(4);
    expect(result.plan.teDeum).toBe('replace-with-responsory');
    const replaced = result.plan.nocturnPlan[0]?.responsories[2];
    expect(replaced?.replacesTeDeum).toBe(true);
  });

  it('omits Te Deum in the Sacred Triduum without responsory replacement markers', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Quad6-5.txt', triduumMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad6-5', 'I-privilegiata-triduum', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-03-29', 'Quad6-5', 'passiontide', 'I-privilegiata-triduum'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.teDeum).toBe('omit');
    const marked = result.plan.nocturnPlan
      .flatMap((nocturn) => nocturn.responsories)
      .some((responsory) => responsory.replacesTeDeum === true);
    expect(marked).toBe(false);
  });
});

function baseRules(): CelebrationRuleSet {
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

function celebration(
  path: string,
  classSymbol: string,
  source: 'temporal' | 'sanctoral'
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
      weight: classSymbol === 'IV' ? 100 : 900
    },
    source
  };
}

function temporal(
  date: string,
  dayName: string,
  season: TemporalContext['season'],
  classSymbol: string
): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season,
    feastRef: {
      path: `Tempora/${dayName}`,
      id: `Tempora/${dayName}`,
      title: dayName
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classSymbol === 'IV' ? 100 : 900
    }
  };
}

function ferialMatinsSections(): string {
  return [
    '[Invit]',
    'Invit feriale',
    '',
    '[Hymnus Matutinum]',
    'Hymnus ferialis',
    '',
    '[Ant Matutinum]',
    'Antiphona I;;8',
    'Antiphona II;;18',
    'Antiphona III;;23',
    '',
    '[Nocturn 1 Versum]',
    'Versus',
    '',
    '[Lectio1]',
    'Text',
    '',
    '[Lectio2]',
    'Text',
    '',
    '[Lectio3]',
    'Text',
    '',
    '[Responsory1]',
    'Resp',
    '',
    '[Responsory2]',
    'Resp',
    '',
    '[Responsory3]',
    'Resp'
  ].join('\n');
}

function adventSundayMatinsSections(): string {
  return [
    '[Lectio1]',
    'Text',
    '',
    '[Lectio2]',
    'Text',
    '',
    '[Lectio3]',
    'Text',
    '',
    '[Lectio4]',
    'Text',
    '',
    '[Lectio5]',
    'Text',
    '',
    '[Lectio6]',
    'Text',
    '',
    '[Lectio7]',
    'Text',
    '',
    '[Lectio8]',
    'Text',
    '',
    '[Lectio9]',
    'Text',
    '',
    '[Responsory1]',
    'Resp',
    '',
    '[Responsory2]',
    'Resp',
    '',
    '[Responsory3]',
    'Resp',
    '',
    '[Responsory4]',
    'Resp',
    '',
    '[Responsory5]',
    'Resp',
    '',
    '[Responsory6]',
    'Resp',
    '',
    '[Responsory7]',
    'Resp',
    '',
    '[Responsory8]',
    'Resp',
    '',
    '[Responsory9]',
    'Resp'
  ].join('\n');
}

function festalMatinsSections(): string {
  return [
    '[Invit]',
    'Invit festale',
    '',
    '[Hymnus Matutinum]',
    'Hymnus festalis',
    '',
    '[Ant Matutinum]',
    'Ant 1;;8',
    'Ant 2;;18',
    'Ant 3;;23',
    'Ant 4;;44',
    'Ant 5;;45',
    'Ant 6;;86',
    'Ant 7;;95',
    'Ant 8;;96',
    'Ant 9;;97',
    '',
    '[Nocturn 1 Versum]',
    'Versus',
    '',
    '[Nocturn 2 Versum]',
    'Versus',
    '',
    '[Nocturn 3 Versum]',
    'Versus',
    '',
    '[Responsory1]',
    'Resp',
    '',
    '[Responsory2]',
    'Resp',
    '',
    '[Responsory3]',
    'Resp',
    '',
    '[Responsory4]',
    'Resp',
    '',
    '[Responsory5]',
    'Resp',
    '',
    '[Responsory6]',
    'Resp',
    '',
    '[Responsory7]',
    'Resp',
    '',
    '[Responsory8]',
    'Resp',
    '',
    '[Responsory9]',
    'Resp'
  ].join('\n');
}

function triduumMatinsSections(): string {
  return [
    '[Nocturn 1 Versum]',
    'Versus',
    '',
    '[Nocturn 2 Versum]',
    'Versus',
    '',
    '[Nocturn 3 Versum]',
    'Versus',
    '',
    '[Responsory1]',
    'Resp',
    '',
    '[Responsory2]',
    'Resp',
    '',
    '[Responsory3]',
    'Resp',
    '',
    '[Responsory4]',
    'Resp',
    '',
    '[Responsory5]',
    'Resp',
    '',
    '[Responsory6]',
    'Resp',
    '',
    '[Responsory7]',
    'Resp',
    '',
    '[Responsory8]',
    'Resp',
    '',
    '[Responsory9]',
    'Resp'
  ].join('\n');
}

function psalteriumMatinsSections(): string {
  return [
    '[Day0]',
    'Ant 1;;1',
    'Ant 2;;2',
    'Ant 3;;3',
    'V. Versus I',
    'R. Responsum I',
    'Ant 4;;4',
    'Ant 5;;5',
    'Ant 6;;6',
    'V. Versus II',
    'R. Responsum II',
    'Ant 7;;7',
    'Ant 8;;8',
    'Ant 9;;9',
    'V. Versus III',
    'R. Responsum III'
  ].join('\n');
}
