import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildVersionRegistry,
  deriveHourRuleSet,
  loadOrdinariumSkeleton,
  resolveVersion,
  rubrics1960Policy,
  structureMatins,
  type Celebration,
  type CelebrationRuleSet,
  type HourRuleSet,
  type LiturgicalSeason,
  type TemporalContext
} from '../../src/index.js';
import { VERSION_POLICY } from '../../src/version/policy-map.js';
import { TestOfficeTextIndex } from '../helpers.js';

const ORDINARIUM_MATINS = `
#Incipit
$Pater noster

#Invitatorium

#Hymnus

#Psalmi cum lectionibus

#Oratio

#Conclusio
`.trim();

const FERIAL_MATINS = `
[Ant Matutinum]
Antiphona I;;8
Antiphona II;;18
Antiphona III;;23

[Nocturn 1 Versum]
Versus

[Lectio1]
Lectio I

[Lectio2]
Lectio II

[Lectio3]
Lectio III

[Responsory1]
Resp I

[Responsory2]
Resp II

[Responsory3]
Resp III
`.trim();

const FESTAL_MATINS = `
[Invit]
Invitatorium proprium

[Hymnus Matutinum]
Hymnus proprius

[Ant Matutinum]
Antiphona I;;8
Antiphona II;;18
Antiphona III;;23
Antiphona IV;;44
Antiphona V;;45
Antiphona VI;;86
Antiphona VII;;95
Antiphona VIII;;96
Antiphona IX;;97

[Nocturn 1 Versum]
Versus I

[Nocturn 2 Versum]
Versus II

[Nocturn 3 Versum]
Versus III

[Lectio1]
Lectio I

[Lectio2]
Lectio II

[Lectio3]
Lectio III

[Lectio4]
Lectio IV

[Lectio5]
Lectio V

[Lectio6]
Lectio VI

[Lectio7]
Lectio VII

[Lectio8]
Lectio VIII

[Lectio9]
Lectio IX

[Responsory1]
Resp I

[Responsory2]
Resp II

[Responsory3]
Resp III

[Responsory4]
Resp IV

[Responsory5]
Resp V

[Responsory6]
Resp VI

[Responsory7]
Resp VII

[Responsory8]
Resp VIII

[Responsory9]
Resp IX
`.trim();

const TRIDUUM_MATINS = `
[Ant Matutinum]
Antiphona I;;8
Antiphona II;;18
Antiphona III;;23
Antiphona IV;;44
Antiphona V;;45
Antiphona VI;;86
Antiphona VII;;95
Antiphona VIII;;96
Antiphona IX;;97

[Nocturn 1 Versum]
Versus I

[Nocturn 2 Versum]
Versus II

[Nocturn 3 Versum]
Versus III

[Lectio1]
Lectio I

[Lectio2]
Lectio II

[Lectio3]
Lectio III

[Lectio4]
Lectio IV

[Lectio5]
Lectio V

[Lectio6]
Lectio VI

[Lectio7]
Lectio VII

[Lectio8]
Lectio VIII

[Lectio9]
Lectio IX

[Responsory1]
Resp I

[Responsory2]
Resp II

[Responsory3]
Resp III

[Responsory4]
Resp IV

[Responsory5]
Resp V

[Responsory6]
Resp VI

[Responsory7]
Resp VII

[Responsory8]
Resp VIII

[Responsory9]
Resp IX
`.trim();

function setup() {
  const corpus = new TestOfficeTextIndex();
  corpus.add('horas/Ordinarium/Matutinum.txt', ORDINARIUM_MATINS);
  corpus.add('horas/Latin/Tempora/Pent07-2.txt', FERIAL_MATINS);
  corpus.add('horas/Latin/Sancti/08-15.txt', FESTAL_MATINS);
  corpus.add('horas/Latin/Tempora/Quad6-5.txt', TRIDUUM_MATINS);

  const registry = buildVersionRegistry([
    {
      version: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960'
    }
  ]);
  const version = resolveVersion(
    asVersionHandle('Rubrics 1960 - 1960'),
    registry,
    VERSION_POLICY
  );

  const skeleton = loadOrdinariumSkeleton('matins', version, corpus);
  return { corpus, skeleton, version };
}

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
    feastRef: { path, id: path, title: path },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classSymbol === 'IV' ? 100 : 1000
    },
    source
  };
}

function temporal(
  date: string,
  dayName: string,
  season: LiturgicalSeason,
  classSymbol: string
): TemporalContext {
  return {
    date,
    dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(),
    weekStem: dayName.split('-', 1)[0] ?? dayName,
    dayName,
    season,
    feastRef: { path: `Tempora/${dayName}`, id: `Tempora/${dayName}`, title: dayName },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: classSymbol === 'IV' ? 100 : 1000
    }
  };
}

describe('structureMatins', () => {
  it('structures ferial Matins as 1 nocturn with Te Deum replaced by responsory', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Tempora/Pent07-2', 'IV', 'temporal');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-07-09', 'Pent07-2', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    expect(result.hour.hour).toBe('matins');
    expect(result.hour.slots.invitatory?.kind).toBe('matins-invitatorium');
    expect(result.hour.slots.psalmody?.kind).toBe('matins-nocturns');
    expect(result.hour.slots['te-deum']?.kind).toBe('te-deum');

    const psalmody = result.hour.slots.psalmody;
    if (psalmody?.kind === 'matins-nocturns') {
      expect(psalmody.nocturns).toHaveLength(1);
    }

    const teDeum = result.hour.slots['te-deum'];
    if (teDeum?.kind === 'te-deum') {
      expect(teDeum.decision).toBe('replace-with-responsory');
    }
  });

  it('structures festal Matins with three nocturns and three lessons each', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Sancti/08-15', 'I', 'sanctoral');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent12-4', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('matins-nocturns');
    if (psalmody?.kind === 'matins-nocturns') {
      expect(psalmody.nocturns).toHaveLength(3);
      expect(psalmody.nocturns.map((nocturn) => nocturn.lessons.length)).toEqual([3, 3, 3]);
    }
  });

  it('emits 1960 Paschal weekday III-class sanctoral Matins directives', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Sancti/08-15', 'III', 'sanctoral');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2026-04-29', 'Pasc3-3', 'eastertide', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    expect(result.hour.directives).toContain('matins-merge-second-third-scripture-lessons');
    expect(result.hour.directives).toContain('matins-invitatory-paschal-alleluia');
  });

  it('emits the 1960 Paschal Sunday scripture-lesson merge directive while preserving Matins structure', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Tempora/Pent07-2', 'II', 'temporal');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2026-05-03', 'Pasc4-0', 'eastertide', 'II'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    expect(result.hour.directives).toContain('matins-merge-second-third-scripture-lessons');
    expect(result.hour.directives).not.toContain('matins-invitatory-paschal-alleluia');

    const psalmody = result.hour.slots.psalmody;
    expect(psalmody?.kind).toBe('matins-nocturns');
    if (psalmody?.kind === 'matins-nocturns') {
      expect(psalmody.nocturns).toHaveLength(1);
      expect(psalmody.nocturns[0]?.lessons.map((lesson) => lesson.index)).toEqual([1, 2, 3]);
    }
  });

  it('does not emit the lesson-merge directive outside Paschaltide 1960 merge cases', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Sancti/08-15', 'III', 'sanctoral');
    const rules = baseRules();
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2026-11-04', 'Pent23-3', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    expect(result.hour.directives).not.toContain('matins-merge-second-third-scripture-lessons');
  });

  it('carries festal Matins hymn doxology variants as a slot', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Sancti/08-15', 'I', 'sanctoral');
    const rules: CelebrationRuleSet = {
      ...baseRules(),
      doxologyVariant: 'Nat'
    };
    const hourRules = deriveHourRuleSet(celeb, rules, 'matins');

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-08-15', 'Pent12-4', 'time-after-pentecost', 'IV'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    expect(result.hour.slots.hymn).toEqual({
      kind: 'single-ref',
      ref: { path: 'horas/Latin/Sancti/08-15', section: 'Hymnus Matutinum' }
    });
    expect(result.hour.slots['doxology-variant']).toEqual({
      kind: 'single-ref',
      ref: { path: 'horas/Latin/Psalterium/Doxologies', section: 'Nat' }
    });
  });

  it('omits Te Deum in Triduum and keeps hymn empty when omitted by hour rules', () => {
    const { corpus, skeleton, version } = setup();
    const celeb = celebration('Tempora/Quad6-5', 'I-privilegiata-triduum', 'temporal');
    const rules = baseRules();
    const hourRules: HourRuleSet = {
      ...deriveHourRuleSet(celeb, rules, 'matins'),
      omit: ['hymnus', 'invitatorium']
    };

    const result = structureMatins({
      skeleton,
      celebration: celeb,
      commemorations: [],
      celebrationRules: rules,
      hourRules,
      temporal: temporal('2024-03-29', 'Quad6-5', 'passiontide', 'I-privilegiata-triduum'),
      policy: rubrics1960Policy,
      corpus,
      version
    });

    const teDeum = result.hour.slots['te-deum'];
    expect(teDeum?.kind).toBe('te-deum');
    if (teDeum?.kind === 'te-deum') {
      expect(teDeum.decision).toBe('omit');
    }
    expect(result.hour.slots.hymn?.kind).toBe('empty');
  });
});
