import { parseFile } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  CLASS_SYMBOLS_1960,
  deriveVespersClass,
  rubrics1960Policy,
  type Celebration,
  type CelebrationRuleSet,
  type ClassSymbol1960,
  type VespersClass
} from '../../src/index.js';

describe('deriveVespersClass', () => {
  it('forces nihil when both first/second Vespers rule flags are disabled', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('I', 'Sancti/08-15', 'sanctoral'),
      celebrationRules: makeRuleSet(false, false),
      feastFile: properVespersFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('nihil');
  });

  it('maps every 1960 class symbol to the expected baseline Vespers class', () => {
    const expectations: Readonly<Record<ClassSymbol1960, VespersClass>> = {
      'I-privilegiata-triduum': 'totum',
      'I-privilegiata-sundays': 'totum',
      'I-privilegiata-ash-wednesday': 'totum',
      'I-privilegiata-holy-week-feria': 'totum',
      'I-privilegiata-christmas-vigil': 'totum',
      'I-privilegiata-rogation-monday': 'totum',
      'II-ember-day': 'nihil',
      I: 'totum',
      II: 'totum',
      III: 'capitulum',
      'IV-lenten-feria': 'nihil',
      IV: 'nihil',
      'commemoration-only': 'nihil'
    };

    for (const classSymbol of CLASS_SYMBOLS_1960) {
      const celebration = makeCelebration(
        classSymbol,
        classSymbol === 'I-privilegiata-sundays' ? 'Tempora/Adv1-0' : 'Sancti/10-07',
        classSymbol.startsWith('I-privilegiata-') ? 'temporal' : 'sanctoral'
      );
      const result = deriveVespersClass({
        celebration,
        celebrationRules: makeRuleSet(true, true),
        feastFile: properVespersFile(),
        policy: rubrics1960Policy
      });
      expect(result, classSymbol).toBe(expectations[classSymbol]);
    }
  });

  it('downgrades II-class without proper Vespers sections to capitulum', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('II', 'Sancti/10-07', 'sanctoral'),
      celebrationRules: makeRuleSet(true, true),
      feastFile: noVespersFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('capitulum');
  });

  it('downgrades III-class without proper Vespers sections to nihil', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('III', 'Sancti/10-07', 'sanctoral'),
      celebrationRules: makeRuleSet(true, true),
      feastFile: noVespersFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('nihil');
  });

  it('detects capitulum-only files as capitulum class for III-class feasts', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('III', 'Sancti/10-07', 'sanctoral'),
      celebrationRules: makeRuleSet(true, true),
      feastFile: capitulumOnlyFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('capitulum');
  });

  it('detects commune references as Vespers-bearing for II-class feasts', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('II', 'Sancti/10-07', 'sanctoral'),
      celebrationRules: makeRuleSet(true, true),
      feastFile: communeReferenceFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('totum');
  });

  it('returns totum for temporal Sundays even when the file has no Vespers sections', () => {
    const result = deriveVespersClass({
      celebration: makeCelebration('IV', 'Tempora/Adv1-0', 'temporal'),
      celebrationRules: makeRuleSet(true, true),
      feastFile: noVespersFile(),
      policy: rubrics1960Policy
    });

    expect(result).toBe('totum');
  });
});

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

function noVespersFile() {
  return parseFile(
    ['[Officium]', 'Festum test', '', '[Rank]', 'Festum test;;Duplex;;3;;'].join('\n'),
    'horas/Latin/Sancti/10-07.txt'
  );
}

function capitulumOnlyFile() {
  return parseFile(
    [
      '[Officium]',
      'Festum test',
      '',
      '[Rank]',
      'Festum test;;Duplex;;3;;',
      '',
      '[Capitulum Vespera]',
      'Capitulum test'
    ].join('\n'),
    'horas/Latin/Sancti/10-07.txt'
  );
}

function communeReferenceFile() {
  return parseFile(
    [
      '[Officium]',
      'Festum test',
      '',
      '[Rank]',
      'Festum test;;Duplex II classis;;5;;',
      '',
      '[Rule]',
      'vide C11'
    ].join('\n'),
    'horas/Latin/Sancti/10-07.txt'
  );
}

function makeCelebration(
  classSymbol: ClassSymbol1960,
  path: string,
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
      weight: classWeight(classSymbol)
    },
    source
  };
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
