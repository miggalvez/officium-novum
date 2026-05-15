import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildMatinsPlanWithWarnings,
  deriveHourRuleSet,
  type Celebration,
  type CelebrationRuleSet,
  type HourRuleSet,
  type ResolvedVersion,
  type TemporalContext
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';
import { rubrics1960Policy } from '../../src/policy/rubrics-1960.js';
import { reduced1955Policy } from '../../src/policy/reduced-1955.js';

const HOUR_RULES: HourRuleSet = {
  hour: 'matins',
  omit: [],
  psalterScheme: 'ferial',
  psalmOverrides: [],
  matinsLessonIntroduction: 'ordinary',
  minorHoursSineAntiphona: false,
  minorHoursFerialPsalter: false,
  dominicalOration: false
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

  it('uses Evangelica as the first 3-lesson benediction for temporal Gospel-homily days', () => {
    const witnesses = [
      {
        date: '2026-02-21',
        dayName: 'Quadp3-6',
        season: 'septuagesima' as const,
        path: 'Tempora/Quadp3-6'
      },
      {
        date: '2026-03-03',
        dayName: 'Quad2-2',
        season: 'lent' as const,
        path: 'Tempora/Quad2-2'
      },
      {
        date: '2026-04-06',
        dayName: 'Pasc0-1',
        season: 'eastertide' as const,
        path: 'Tempora/Pasc0-1'
      },
      {
        date: '2026-05-25',
        dayName: 'Pasc7-1',
        season: 'pentecost-octave' as const,
        path: 'Tempora/Pasc7-1'
      },
      {
        date: '2026-08-14',
        dayName: 'Pent12-5',
        season: 'time-after-pentecost' as const,
        path: 'Sancti/08-15',
        source: 'sanctoral' as const,
        kind: 'vigil' as const
      },
      {
        date: '2026-09-26',
        dayName: 'Epi4-6',
        season: 'time-after-pentecost' as const,
        path: 'Tempora/Epi4-6'
      }
    ];

    for (const witness of witnesses) {
      const corpus = new TestOfficeTextIndex();
      corpus.add(`${witness.path}.txt`, ferialMatinsSections());

      const result = buildMatinsPlanWithWarnings({
        celebration: celebration(
          witness.path,
          'IV',
          witness.source ?? 'temporal',
          witness.kind
        ),
        celebrationRules: baseRules(),
        commemorations: [],
        hourRules: HOUR_RULES,
        temporal: temporal(witness.date, witness.dayName, witness.season, 'IV'),
        policy: rubrics1960Policy,
        corpus,
        version: version1960()
      });

      expect(result.plan.totalLessons, witness.date).toBe(3);
      const benedictions = result.plan.nocturnPlan[0]?.benedictions ?? [];
      expect(benedictions[0], witness.date).toEqual({
        index: 1,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Evangelica',
          selector: '1'
        }
      });
      if ((witness.source ?? 'temporal') === 'temporal') {
        expect(benedictions.slice(1), witness.date).toEqual([
          {
            index: 2,
            reference: {
              path: 'horas/Latin/Psalterium/Benedictions.txt',
              section: 'Nocturn 3',
              selector: '2'
            }
          },
          {
            index: 3,
            reference: {
              path: 'horas/Latin/Psalterium/Benedictions.txt',
              section: 'Nocturn 3',
              selector: '3'
            }
          }
        ]);
      }
    }
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

  it('substitutes Pasch0 antiphons over Sunday Matins psalms in Paschaltide', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pasc1-0.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      paschaltideSundayPsalterSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pasc1-0', 'I', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-04-07', 'Pasc1-0', 'eastertide', 'I'),
      policy: reduced1955Policy,
      corpus,
      version: version1955()
    });

    expect(result.plan.nocturns).toBe(1);
    const psalmody = result.plan.nocturnPlan[0]?.psalmody ?? [];
    expect(psalmody).toHaveLength(9);
    expect(psalmody.map((assignment) => assignment.psalmRef.selector)).toEqual([
      '1',
      '2',
      '3',
      '8',
      '9(2-11)',
      '9(12-21)',
      '9(22-32)',
      '9(33-39)',
      '10'
    ]);
    expect(
      psalmody.flatMap((assignment, index) =>
        assignment.antiphonRef ? [{ index: index + 1, ...assignment.antiphonRef }] : []
      )
    ).toEqual([
      {
        index: 1,
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '1'
      },
      {
        index: 4,
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '6'
      },
      {
        index: 7,
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '11'
      }
    ]);
    expect(result.plan.nocturnPlan[0]?.antiphons.map((antiphon) => antiphon.reference)).toEqual([
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '1'
      },
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '6'
      },
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '11'
      }
    ]);
  });

  it('keeps only the first Pasch0 antiphon for the 1960 one-nocturn Sunday shape', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pasc1-0.txt', adventSundayMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      paschaltideSundayPsalterSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pasc1-0', 'I', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-04-07', 'Pasc1-0', 'eastertide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturns).toBe(1);
    expect(result.plan.nocturnPlan[0]?.psalmody).toHaveLength(9);
    expect(result.plan.nocturnPlan[0]?.antiphons.map((antiphon) => antiphon.reference)).toEqual([
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Pasch0',
        selector: '1'
      }
    ]);
  });

  it('keeps psalm-only rows from proper Matins antiphon sections in the normalized plan', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/05-01r.txt',
      [
        festalMatinsSections().replace(
          [
            'Ant 1;;8',
            'Ant 2;;18',
            'Ant 3;;23',
            'Ant 4;;44',
            'Ant 5;;45',
            'Ant 6;;86',
            'Ant 7;;95',
            'Ant 8;;96',
            'Ant 9;;97'
          ].join('\n'),
          [
            'Exit homo * ad opus suum.;;1',
            ';;2',
            ';;3',
            'Jesus, * cum esset trigínta annórum.;;4',
            ';;5',
            ';;8',
            'Nonne hic est * fabri fílius?;;14',
            ';;20',
            ';;23'
          ].join('\n')
        ),
        '',
        '[Lectio1]',
        'De libro Génesis',
        '',
        '[Lectio2]',
        'Text',
        '',
        '[Lectio3]',
        'Text',
        '',
        '[Lectio7]',
        'Gospel and homily',
        '',
        '[Lectio8]',
        'Homily continuation',
        '',
        '[Lectio9]',
        'Homily conclusion',
        '&teDeum'
      ].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/05-01r', 'I', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2026-05-01', 'Pasc3-5', 'eastertide', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturns).toBe(3);
    expect(result.plan.nocturnPlan.map((nocturn) => nocturn.psalmody.length)).toEqual([
      3,
      3,
      3
    ]);
    expect(
      result.plan.nocturnPlan.flatMap((nocturn) =>
        nocturn.psalmody.map((assignment) => assignment.psalmRef.selector)
      )
    ).toEqual(['1', '2', '3', '4', '5', '8', '14', '20', '23']);
    expect(
      result.plan.nocturnPlan.flatMap((nocturn) =>
        nocturn.antiphons.map((antiphon) => antiphon.reference.selector)
      )
    ).toEqual(['1', '4', '7']);
    expect(
      result.plan.nocturnPlan[0]?.lessons.map((lesson) =>
        lesson.source.kind === 'patristic' || lesson.source.kind === 'hagiographic'
          ? lesson.source.reference
          : undefined
      )
    ).toEqual([
      { path: 'horas/Latin/Sancti/05-01r', section: 'Lectio1' },
      { path: 'horas/Latin/Sancti/05-01r', section: 'Lectio2' },
      { path: 'horas/Latin/Sancti/05-01r', section: 'Lectio3' }
    ]);
    expect(result.plan.nocturnPlan[2]?.benedictions[0]?.reference).toEqual({
      path: 'horas/Latin/Psalterium/Benedictions.txt',
      section: 'Evangelica',
      selector: '1'
    });
    expect(result.plan.nocturnPlan[2]?.benedictions[1]?.reference).toEqual({
      path: 'horas/Latin/Psalterium/Benedictions.txt',
      section: 'Nocturn 3',
      selector: '4'
    });
    expect(
      result.plan.nocturnPlan[2]?.lessons.map((lesson) =>
        lesson.source.kind === 'patristic' ? lesson.source.reference : lesson.source.kind
      )
    ).toEqual([
      'homily-on-gospel',
      { path: 'horas/Latin/Sancti/05-01r', section: 'Lectio8' },
      { path: 'horas/Latin/Sancti/05-01r', section: 'Lectio9', selector: '1-1' }
    ]);
  });

  it('keeps sanctoral feasts of the Lord on ordinary third-nocturn benedictions', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/01-06.txt', festalMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/01-06', 'I', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2026-01-06', 'Epi1-2', 'epiphanytide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturnPlan[2]?.benedictions).toEqual([
      {
        index: 7,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Evangelica',
          selector: '1'
        }
      },
      {
        index: 8,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Nocturn 3',
          selector: '2'
        }
      },
      {
        index: 9,
        reference: {
          path: 'horas/Latin/Psalterium/Benedictions.txt',
          section: 'Nocturn 3',
          selector: '3'
        }
      }
    ]);
  });

  it('uses ferial Matins psalms with one Paschal Alleluia antiphon for 1960 III-class sanctoral weekdays', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/04-29.txt', festalMatinsSections());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      thirdClassSanctoralWeekdayPaschalMatinsPsalterSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/04-29', 'III', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2026-04-29', 'Pasc3-3', 'eastertide', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    const psalmody = result.plan.nocturnPlan[0]?.psalmody ?? [];
    expect(result.plan.nocturns).toBe(1);
    expect(psalmody.map((assignment) => assignment.psalmRef.selector)).toEqual([
      "44('2a'-'10b')",
      "44(11-'18b')",
      '45'
    ]);
    expect(psalmody.map((assignment) => assignment.antiphonRef)).toEqual([
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Paschm0',
        selector: '17'
      },
      undefined,
      undefined
    ]);
    expect(result.plan.nocturnPlan[0]?.antiphons.map((antiphon) => antiphon.reference)).toEqual([
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
        section: 'Paschm0',
        selector: '17'
      }
    ]);
  });

  it('routes 1960 III-class sanctoral weekday lessons through the occurring feria and proper contracted legend', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/04-29.txt',
      [
        '[Lectio94]',
        'Legenda propria contracta.',
        '&teDeum',
        '',
        '[Responsory3]',
        'Responsory commune'
      ].join('\n')
    );
    corpus.add(
      'horas/Latin/Tempora/Pasc3-3.txt',
      [
        '[Lectio1]',
        'Scriptura occurrens I',
        '',
        '[Responsory1]',
        'Responsory feria I',
        '',
        '[Lectio2]',
        'Scriptura occurrens II',
        '',
        '[Responsory2]',
        'Responsory feria II',
        '',
        '[Lectio3]',
        'Scriptura occurrens III',
        '',
        '[Responsory3]',
        'Responsory feria III'
      ].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/04-29', 'III', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2026-04-29', 'Pasc3-3', 'eastertide', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    const nocturn = result.plan.nocturnPlan[0];
    expect(result.plan.teDeum).toBe('say');
    expect(nocturn?.lessons.map((lesson) => lesson.source)).toEqual([
      {
        kind: 'scripture',
        course: 'paschaltide',
        pericope: {
          book: 'paschaltide',
          reference: { path: 'horas/Latin/Tempora/Pasc3-3', section: 'Lectio1' }
        }
      },
      {
        kind: 'scripture',
        course: 'paschaltide',
        pericope: {
          book: 'paschaltide',
          reference: { path: 'horas/Latin/Tempora/Pasc3-3', section: 'Lectio2' }
        }
      },
      {
        kind: 'hagiographic',
        reference: {
          path: 'horas/Latin/Sancti/04-29',
          section: 'Lectio94',
          selector: '1-1'
        }
      }
    ]);
    expect(nocturn?.responsories).toEqual([
      {
        index: 1,
        reference: { path: 'horas/Latin/Tempora/Pasc3-3', section: 'Responsory1' }
      },
      {
        appendGloria: true,
        index: 2,
        reference: { path: 'horas/Latin/Tempora/Pasc3-3', section: 'Responsory3' }
      }
    ]);
    expect(nocturn?.benedictions.map((entry) => entry.reference.selector)).toEqual([
      '1',
      '4',
      '3'
    ]);

    const widowCelebration = celebration('Sancti/04-29', 'III', 'sanctoral');
    const widowResult = buildMatinsPlanWithWarnings({
      celebration: {
        ...widowCelebration,
        feastRef: {
          ...widowCelebration.feastRef,
          title: 'S. Monicæ Viduæ'
        }
      },
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2026-05-04', 'Pasc4-1', 'eastertide', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });
    expect(widowResult.plan.nocturnPlan[0]?.benedictions.map((entry) => entry.reference.selector)).toEqual([
      '1',
      '6',
      '3'
    ]);
  });

  it('uses Paschaltide common variants for inherited Matins invitatories', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/04-29.txt',
      ['[Rule]', 'vide C2a-1;', '', '[Oratio]', 'Oratio propria'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C2a-1.txt',
      ['[Invit]', 'Regem Mártyrum Dóminum, * Veníte, adorémus.'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C2a-1p.txt',
      ['@Commune/C2p', '', '[Hymnus Matutinum]', 'Deus tuórum mílitum'].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C2p.txt',
      ['[Invit]', 'Exsúltent in Dómino sancti, * Allelúja.'].join('\n')
    );

    const celebrationContext = celebration('Sancti/04-29', 'III', 'sanctoral');
    const temporalContext = temporal('2026-04-29', 'Pasc3-3', 'eastertide', 'IV');
    const hourRules = deriveHourRuleSet(celebrationContext, baseRules(), 'matins', [], {
      temporal: temporalContext
    });

    expect(hourRules.commonSourceVariant).toBe('paschaltide');

    const result = buildMatinsPlanWithWarnings({
      celebration: celebrationContext,
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules,
      temporal: temporalContext,
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.invitatorium).toEqual({
      kind: 'feast',
      reference: {
        path: 'horas/Latin/Commune/C2a-1p',
        section: 'Invit'
      }
    });
    expect(result.plan.hymn).toEqual({
      kind: 'feast',
      reference: {
        path: 'horas/Latin/Commune/C2a-1p',
        section: 'Hymnus Matutinum'
      }
    });
  });

  it('falls through to inherited Easter Octave Matins antiphons when the local section only overlays a reference and versicle', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pasc0-0.txt', easterSundayMatinsSections());
    corpus.add('horas/Latin/Tempora/Pasc0-2.txt', easterWeekdayMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pasc0-2', 'I', 'temporal'),
      celebrationRules: {
        ...baseRules(),
        officeReferenceRules: [{ kind: 'ex', target: 'Pasc0-0' }]
      },
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-04-02', 'Pasc0-2', 'eastertide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturns).toBe(1);
    expect(result.plan.nocturnPlan[0]?.antiphons.map((antiphon) => antiphon.reference)).toEqual([
      {
        path: 'horas/Latin/Tempora/Pasc0-0',
        section: 'Ant Matutinum',
        selector: '1'
      },
      {
        path: 'horas/Latin/Tempora/Pasc0-0',
        section: 'Ant Matutinum',
        selector: '2'
      },
      {
        path: 'horas/Latin/Tempora/Pasc0-0',
        section: 'Ant Matutinum',
        selector: '3'
      }
    ]);
    expect(result.plan.nocturnPlan[0]?.psalmody).toHaveLength(3);
    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Tempora/Pasc0-2',
      section: 'Ant Matutinum',
      selector: '5-6'
    });
  });

  it('prefers the Matins antiphon block versicle before plain Versum 1', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Pasc7-0.txt', pentecostMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Pasc7-0', 'I', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-05-19', 'Pasc7-0', 'eastertide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Tempora/Pasc7-0',
      section: 'Ant Matutinum',
      selector: '4-5'
    });
  });

  it('prefers version-gated Matins antiphon sections over unconditional fallbacks', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/TestConditional.txt', conditionalMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/TestConditional', 'I', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-05-19', 'Pasc7-0', 'eastertide', 'I'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(
      result.plan.nocturnPlan[0]?.antiphons.map((antiphon) => antiphon.psalmRef?.psalmRef.path)
    ).toEqual([
      'horas/Latin/Psalterium/Psalmorum/Psalm10',
      'horas/Latin/Psalterium/Psalmorum/Psalm11',
      'horas/Latin/Psalterium/Psalmorum/Psalm12'
    ]);
  });

  it('substitutes seasonal Matins versicle on a Lenten Saturday ferial 1-nocturn', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Quad1-6.txt', ferialMatinsSectionsWithoutVersicle());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    // 2024-02-24 was Saturday after Lent 1, ferial 3-lesson Matins.
    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad1-6', 'IV', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-02-24', 'Quad1-6', 'lent', 'IV'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturns).toBe(1);
    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Quad 3 Versum'
    });
  });

  it('substitutes seasonal Matins versicle on a Passiontide Tuesday ferial 1-nocturn', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Tempora/Quad5-2.txt', ferialMatinsSectionsWithoutVersicle());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    // 2024-03-26 was Tuesday in Holy Week, ferial 3-lesson Matins.
    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Tempora/Quad5-2', 'IV', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-03-26', 'Quad5-2', 'passiontide', 'IV'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Quad5 2 Versum'
    });
  });

  it('substitutes Nat24 Versum for the Vigil of Christmas regardless of weekday', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/12-24.txt', ferialMatinsSectionsWithoutVersicle());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    // 2024-12-24 was Tuesday Christmas Eve.
    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-24', 'I', 'temporal'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-24', 'Adv4-2', 'advent', 'I'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Nat24 Versum'
    });
  });

  it('does not apply the weekday seasonal Matins versicle to a sanctoral 1-nocturn', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/03-26.txt', ferialMatinsSectionsWithoutVersicle());
    corpus.add(
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum.txt',
      psalteriumMatinsSections()
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/03-26', 'III', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-03-26', 'Quad5-2', 'passiontide', 'III'),
      policy: rubrics1960Policy,
      corpus
    });

    // The seasonal Quad5 weekday substitution only fires for temporal-driven
    // celebrations. A sanctoral III-class day instead falls through to the
    // psalter day section.
    expect(result.plan.nocturnPlan[0]?.versicle.reference.section).not.toBe(
      'Quad5 2 Versum'
    );
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

  it('adds seasonal Nativity doxology metadata to Christmas-octave common Matins hymns', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/12-26.txt', festalMatinsSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-26', 'II', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-26', 'Nat2-0', 'christmas', 'II'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.hymn.kind).toBe('feast');
    if (result.plan.hymn.kind === 'feast') {
      expect(result.plan.hymn.doxologyVariant).toBe('Nat');
    }
  });

  it('uses plain Versum 1 as the first nocturn versicle when no Nocturn 1 Versum exists', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add('horas/Latin/Sancti/12-27.txt', firstNocturnVersumSections());

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-27', 'II', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-27', 'Nat3-0', 'christmas', 'II'),
      policy: rubrics1960Policy,
      corpus
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Sancti/12-27',
      section: 'Versum 1'
    });
  });

  it('prefers inherited concrete Versum 1 over a delegating proper alias', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/12-26.txt',
      [
        '[Rule]',
        'ex C2a;',
        '',
        '[Versum 1]',
        '@Commune/C2a',
        '',
        festalMatinsSectionsWithoutFirstVersicle()
      ].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C2a.txt',
      ['[Versum 1]', 'V. Glória et honóre coronásti eum, Dómine.'].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-26', 'II', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-26', 'Nat2-0', 'christmas', 'II'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Commune/C2a',
      section: 'Versum 1'
    });
  });

  it('prefers inherited concrete Versum 1 over a separator-only proper placeholder', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/12-26.txt',
      [
        '[Rule]',
        'ex C2a;',
        '',
        '[Versum 1]',
        '_',
        '',
        festalMatinsSectionsWithoutFirstVersicle()
      ].join('\n')
    );
    corpus.add(
      'horas/Latin/Commune/C2a.txt',
      ['[Versum 1]', 'V. Glória et honóre coronásti eum, Dómine.'].join('\n')
    );

    const result = buildMatinsPlanWithWarnings({
      celebration: celebration('Sancti/12-26', 'II', 'sanctoral'),
      celebrationRules: baseRules(),
      commemorations: [],
      hourRules: HOUR_RULES,
      temporal: temporal('2024-12-26', 'Nat2-0', 'christmas', 'II'),
      policy: rubrics1960Policy,
      corpus,
      version: version1960()
    });

    expect(result.plan.nocturnPlan[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Commune/C2a',
      section: 'Versum 1'
    });
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
      },
      doxologyVariant: 'Pasch'
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

function version1955(): ResolvedVersion {
  return {
    handle: asVersionHandle('Reduced - 1955'),
    kalendar: 'Reduced',
    transfer: 'Reduced',
    stransfer: 'Reduced',
    policy: reduced1955Policy
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
  source: 'temporal' | 'sanctoral',
  kind?: Celebration['kind']
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
    source,
    ...(kind ? { kind } : {})
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

function ferialMatinsSectionsWithoutVersicle(): string {
  return [
    '[Invit]',
    'Invit feriale',
    '',
    '[Hymnus Matutinum]',
    'Hymnus ferialis',
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

function easterSundayMatinsSections(): string {
  return [
    '[Ant Matutinum]',
    'Ego sum qui sum, * et consílium meum non est cum ímpiis, sed in lege Dómini volúntas mea est, allelúja.;;1',
    'Postulávi Patrem meum, * allelúja: dedit mihi gentes, allelúja, in hereditátem, allelúja.;;2',
    'Ego dormívi, * et somnum cepi: et exsurréxi, quóniam Dóminus suscépit me, allelúja, allelúja.;;3',
    'V. Surréxit Dóminus de sepúlcro, allelúja.',
    'R. Qui pro nobis pepéndit in ligno, allelúja.'
  ].join('\n');
}

function paschaltideSundayPsalterSections(): string {
  return [
    '[Day0]',
    'Beátus vir * qui in lege Dómini meditátur.;;1',
    'Servíte Dómino * in timóre, et exsultáte ei cum tremóre.;;2',
    'Exsúrge, * Dómine, salvum me fac, Deus meus.;;3',
    'V. Memor fui nocte nóminis tui, Dómine.',
    'R. Et custodívi legem tuam.',
    'Quam admirábile * est nomen tuum, Dómine, in univérsa terra!;;8',
    'Sedísti super thronum * qui júdicas justítiam.;;9(2-11)',
    'Exsúrge, Dómine, * non præváleat homo.;;9(12-21)',
    'V. Média nocte surgébam ad confiténdum tibi.',
    'R. Super judícia justificatiónis tuæ.',
    'Ut quid, Dómine, * recessísti longe?;;9(22-32)',
    'Exsúrge, * Dómine Deus, exaltétur manus tua.;;9(33-39)',
    'Justus Dóminus * et justítiam diléxit.;;10',
    'V. Prævenérunt óculi mei ad te dilúculo.',
    'R. Ut meditárer elóquia tua, Dómine.',
    '',
    '[Pasch0]',
    'Allelúja, * lapis revolútus est, allelúja: ab óstio monuménti, allelúja, allelúja.;;',
    ';;',
    ';;',
    'V. Surréxit Dóminus de sepúlcro, allelúja.',
    'R. Qui pro nobis pepéndit in ligno, allelúja.',
    'Allelúja, * quem quæris, múlier? allelúja: vivéntem cum mórtuis? Allelúja, allelúja.;;',
    ';;',
    ';;',
    'V. Surréxit Dóminus vere, allelúja.',
    'R. Et appáruit Simóni, allelúja.',
    'Allelúja, * noli flere María, allelúja: resurréxit Dóminus, allelúja, allelúja.;;',
    ';;',
    ';;',
    'V. Gavísi sunt discípuli, allelúja.',
    'R. Viso Dómino, allelúja.',
    '',
    '[Pasch 1 Versum]',
    'V. Surréxit Dóminus de sepúlcro, allelúja.',
    'R. Qui pro nobis pepéndit in ligno, allelúja.',
    '',
    '[Pasch 2 Versum]',
    'V. Surréxit Dóminus vere, allelúja.',
    'R. Et appáruit Simóni, allelúja.',
    '',
    '[Pasch 3 Versum]',
    'V. Gavísi sunt discípuli, allelúja.',
    'R. Viso Dómino, allelúja.'
  ].join('\n');
}

function thirdClassSanctoralWeekdayPaschalMatinsPsalterSections(): string {
  return [
    '[Day3]',
    "Speciósus forma * præ fíliis hóminum, diffúsa est grátia in lábiis tuis.;;44('2a'-'10b')",
    "Confitebúntur tibi * pópuli Deus in ætérnum.;;44(11-'18b')",
    'Adjútor in tribulatiónibus * Deus noster.;;45',
    'V. Dóminus virtútum nobíscum.',
    'R. Suscéptor noster, Deus Jacob.',
    '',
    '[Paschm0]',
    'Allelúja, * lapis revolútus est, allelúja: ab óstio monuménti, allelúja, allelúja.;;20',
    ';;21',
    ';;22',
    ';;23',
    ';;24',
    ';;25',
    'V. Surréxit Dóminus de sepúlcro, allelúja.',
    'R. Qui pro nobis pepéndit in ligno, allelúja.',
    'Allelúja, * quem quæris múlier? allelúja: vivéntem cum mórtuis? allelúja, allelúja.;;26',
    ';;27',
    ';;28',
    ';;29',
    ';;30',
    ';;31',
    'V. Surréxit Dóminus vere, allelúja.',
    'R. Et appáruit Simóni, allelúja.',
    'Allelúja, * allelúja, allelúja.;;243;244;245'
  ].join('\n');
}

function easterWeekdayMatinsSections(): string {
  return [
    '[Rule]',
    'ex Pasc0-0;',
    '',
    '[Ant Matutinum]',
    '@Tempora/Pasc0-0::s/^V\\..*//sm',
    'V. Surréxit Dóminus vere, allelúja.',
    'R. Et appáruit Simóni, allelúja.',
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

function pentecostMatinsSections(): string {
  return [
    '[Ant Matutinum]',
    'Factus est * repénte de cælo sonus adveniéntis spíritus veheméntis, allelúja, allelúja.;;47',
    'Confírma hoc, Deus, * quod operátus es in nobis: a templo sancto tuo, quod est in Jerúsalem, allelúja, allelúja.;;67',
    'Emítte Spíritum tuum, * et creabúntur: et renovábis fáciem terræ, allelúja, allelúja.;;103',
    'V. Spíritus Dómini replévit orbem terrárum, allelúja.',
    'R. Et hoc quod cóntinet ómnia, sciéntiam habet vocis, allelúja.',
    '',
    '[Versum 1]',
    'V. Repléti sunt omnes Spíritu Sancto, allelúja.',
    'R. Et cœpérunt loqui, allelúja.',
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

function conditionalMatinsSections(): string {
  return [
    '[Ant Matutinum]',
    'Default 1;;1',
    'Default 2;;2',
    'Default 3;;3',
    'V. Default.',
    'R. Default.',
    '',
    '[Ant Matutinum] (rubrica 1960)',
    'Proper 1;;10',
    'Proper 2;;11',
    'Proper 3;;12',
    'V. Proper.',
    'R. Proper.',
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

function firstNocturnVersumSections(): string {
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
    '[Versum 1]',
    'V. Versum proprium.',
    'R. Responsum proprium.',
    '',
    '[Nocturn 2 Versum]',
    'Versus II',
    '',
    '[Nocturn 3 Versum]',
    'Versus III',
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

function festalMatinsSectionsWithoutFirstVersicle(): string {
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
    '[Nocturn 2 Versum]',
    'Versus II',
    '',
    '[Nocturn 3 Versum]',
    'Versus III',
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
    '[Day2]',
    'Day2 Ant 1;;1',
    'Day2 Ant 2;;2',
    'Day2 Ant 3;;3',
    'V. Day2 Versus I',
    'R. Day2 Responsum I',
    'Day2 Ant 4;;4',
    'Day2 Ant 5;;5',
    'Day2 Ant 6;;6',
    'V. Day2 Versus II',
    'R. Day2 Responsum II',
    'Day2 Ant 7;;7',
    'Day2 Ant 8;;8',
    'Day2 Ant 9;;9',
    'V. Day2 Versus III',
    'R. Day2 Responsum III',
    '',
    '[Day6]',
    'Day6 Ant 1;;1',
    'Day6 Ant 2;;2',
    'Day6 Ant 3;;3',
    'V. Day6 Versus I',
    'R. Day6 Responsum I',
    'Day6 Ant 4;;4',
    'Day6 Ant 5;;5',
    'Day6 Ant 6;;6',
    'V. Day6 Versus II',
    'R. Day6 Responsum II',
    'Day6 Ant 7;;7',
    'Day6 Ant 8;;8',
    'Day6 Ant 9;;9',
    'V. Day6 Versus III',
    'R. Day6 Responsum III',
    '',
    '[Quad 1 Versum]',
    'V. Ipse liberávit me de láqueo venántium.',
    'R. Et a verbo áspero.',
    '',
    '[Quad 3 Versum]',
    'V. Scuto circúmdabit te véritas ejus.',
    'R. Non timébis a timóre noctúrno.',
    '',
    '[Quad5 1 Versum]',
    'V. Érue a frámea, Deus, ánimam meam.',
    'R. Et de manu canis únicam meam.',
    '',
    '[Quad5 2 Versum]',
    'V. De ore leónis líbera me, Dómine.',
    'R. Et a córnibus unicórnium humilitátem meam.',
    '',
    '[Nat24 Versum]',
    'V. Hódie sciétis quia véniet Dóminus.',
    'R. Et mane vidébitis glóriam ejus.',
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
