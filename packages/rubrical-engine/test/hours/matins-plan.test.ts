import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildMatinsPlanWithWarnings,
  type Celebration,
  type CelebrationRuleSet,
  type HourRuleSet,
  type ResolvedVersion,
  type TemporalContext
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';
import { rubrics1960Policy } from '../../src/policy/rubrics-1960.js';

const HOUR_RULES: HourRuleSet = {
  hour: 'matins',
  omit: [],
  psalterScheme: 'ferial',
  psalmOverrides: [],
  matinsLessonIntroduction: 'ordinary',
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
    expect(result.plan.nocturnPlan[0]?.benedictions).toEqual([
      {
        index: 1,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Nocturn 2',
          selector: '1'
        }
      },
      {
        index: 2,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Nocturn 2',
          selector: '2'
        }
      },
      {
        index: 3,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Nocturn 2',
          selector: '3'
        }
      }
    ]);
  });

  it('builds Advent Sunday as 1 nocturn with Te Deum replaced by the third responsory', () => {
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

    expect(result.plan.nocturns).toBe(1);
    expect(result.plan.totalLessons).toBe(3);
    expect(result.plan.teDeum).toBe('replace-with-responsory');
    expect(result.plan.nocturnPlan).toHaveLength(1);
    expect(result.plan.nocturnPlan[0]?.antiphons).toHaveLength(9);
    expect(result.plan.nocturnPlan[0]?.psalmody).toHaveLength(9);
    expect(result.plan.nocturnPlan[0]?.versicle.reference.path).toBe(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum'
    );
    expect(result.plan.nocturnPlan[0]?.versicle.reference.section).toBe('Adv 0 Ant Matutinum');
    expect(result.plan.nocturnPlan[0]?.versicle.reference.selector).toBe('4');
  });

  it('keeps Advent Sunday Matins psalter versicles per-nocturn for 3-nocturn offices', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/12-15.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-15', 'I', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-15', 'Adv3-0', 'advent', 'I-privilegiata-sundays'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturns).toBe(3);
    expect(result.plan.nocturnPlan.map((nocturn) => nocturn.versicle.reference)).toEqual([
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Adv 0 Ant Matutinum',
        selector: '4'
      },
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Adv 0 Ant Matutinum',
        selector: '9'
      },
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Adv 0 Ant Matutinum',
        selector: '14'
      }
    ]);
  });

  it('uses seasonal Sunday Matins versicles in Lent and Passiontide', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Quad1-0.txt', adventSundayMatinsSections());
    corpus.add('horas/Latin/Tempora/Quad5-0.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    const lenten = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad1-0', 'I-privilegiata-sundays', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-02-18', 'Quad1-0', 'lent', 'I-privilegiata-sundays'),
      policy: rubrics1960Policy,
      corpus
    });

    const passiontide = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad5-0', 'I-privilegiata-sundays', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-03-17', 'Quad5-0', 'passiontide', 'I-privilegiata-sundays'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(lenten.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Quad 1 Versum'
    });
    expect(passiontide.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Quad5 1 Versum'
    });
  });

  it('uses the ordinary Sunday Matins hymn from Matutinum Special before April', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Epi2-0.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Epi2-0', 'II', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-01-14', 'Epi2-0', 'time-after-epiphany', 'II'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.hymn).toEqual({
      kind: 'ordinary',
      reference: {
        path: 'horas/Latin/Psalterium/Special/Matutinum Special',
        section: 'Day0 Hymnus1'
      }
    });
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

  it('uses the post-Cum Nostra Hac Aetate Confessor hymn variant for inherited C5 Matins', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/08-19.txt',
      ['[Rule]', 'vide C5;', '', '[Lectio1]', 'Text'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C5.txt',
      ['@Commune/C4', '', '[Rule]', 'Psalmi Dominica', 'Antiphonas horas'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C4.txt',
      [
        '[Hymnus Matutinum]',
        'Hac die lætus méruit beátas',
        '',
        '[Hymnus1 Matutinum]',
        'Hac die lætus méruit suprémos'
      ].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/08-19', 'III', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-08-19', 'Pent10-1', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.hymn).toEqual({
      kind: 'feast',
      reference: {
        path: 'horas/Latin/Commune/C5',
        section: 'Hymnus1 Matutinum'
      }
    });
  });

  it('detects an mtv Confessor hymn variant rule at the start of a rule line', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/04-28.txt',
      ['[Rule]', 'vide C5;', 'mtv', '', '[Lectio1]', 'Text'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C5.txt',
      ['@Commune/C4', '', '[Rule]', 'Psalmi Dominica', 'Antiphonas horas'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C4.txt',
      [
        '[Hymnus Matutinum]',
        'Hac die lætus méruit beátas',
        '',
        '[Hymnus1 Matutinum]',
        'Hac die lætus méruit suprémos'
      ].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/04-28', 'III', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-04-28', 'Pasc1-0', 'eastertide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1954()
    });

    expect(result.plan.hymn).toEqual({
      kind: 'feast',
      reference: {
        path: 'horas/Latin/Commune/C5',
        section: 'Hymnus1 Matutinum'
      }
    });
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

  it('switches Limit Benedictiones Oratio offices to the secret Pater-only lesson introduction', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Quad6-5.txt', triduumMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad6-5', 'I-privilegiata-triduum', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: {
        ...HOUR_RULES,
        matinsLessonIntroduction: 'pater-totum-secreto'
      },
      temporal: temporal('2024-03-29', 'Quad6-5', 'passiontide', 'I-privilegiata-triduum'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturnPlan).toHaveLength(3);
    expect(
      result.plan.nocturnPlan.map((nocturn) => nocturn.lessonIntroduction)
    ).toEqual(['pater-totum-secreto', 'pater-totum-secreto', 'pater-totum-secreto']);
    expect(
      result.plan.nocturnPlan.map((nocturn) => nocturn.benedictions)
    ).toEqual([[], [], []]);
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

function version1960(): ResolvedVersion {
  return {
    handle: asVersionHandle('Rubrics 1960 - 1960'),
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    policy: rubrics1960Policy
  };
}

function version1954(): ResolvedVersion {
  return {
    handle: asVersionHandle('Divino Afflatu - 1954'),
    kalendar: 'Divino Afflatu',
    transfer: 'Divino Afflatu',
    stransfer: 'Divino Afflatu',
    policy: rubrics1960Policy
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
    'R. Responsum III',
    '',
    '[Quad 1 Versum]',
    'V. Ipse liberávit me de láqueo venántium.',
    'R. Et a verbo áspero.',
    '',
    '[Quad5 1 Versum]',
    'V. Érue a frámea, Deus, ánimam meam.',
    'R. Et de manu canis únicam meam.',
    '',
    '[Adv 0 Ant Matutinum]',
    'Adv Ant 1;;1',
    'Adv Ant 2;;2',
    'Adv Ant 3;;3',
    'V. Adv Versus I',
    'R. Adv Responsum I',
    'Adv Ant 4;;8',
    'Adv Ant 5;;9',
    'Adv Ant 6;;9',
    'V. Adv Versus II',
    'R. Adv Responsum II',
    'Adv Ant 7;;9',
    'Adv Ant 8;;9',
    'Adv Ant 9;;10',
    'V. Adv Versus III',
    'R. Adv Responsum III'
  ].join('\n');
}
