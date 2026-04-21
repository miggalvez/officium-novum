import { parseRuleLine, type RuleDirective } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { deriveHourRuleSet } from '../../src/rules/merge.js';
import type { Celebration, CelebrationRuleSet } from '../../src/index.js';

describe('deriveHourRuleSet', () => {
  it('derives dominica psalter for Lauds', () => {
    const rules = makeCelebrationRuleSet(['Psalmi Dominica']);

    const hourRules = deriveHourRuleSet(makeCelebration(), rules, 'lauds');

    expect(hourRules.psalterScheme).toBe('dominica');
  });

  it('derives Psalm5 Vespera override for Vespers', () => {
    const rules = makeCelebrationRuleSet(['Psalm5 Vespera=116']);

    const hourRules = deriveHourRuleSet(makeCelebration(), rules, 'vespers');

    expect(hourRules.psalmOverrides).toContainEqual({
      key: 'Psalm5Vespera',
      value: '116'
    });
  });

  it('derives Minores sine Antiphona for Prime', () => {
    const rules = makeCelebrationRuleSet(['Minores sine Antiphona']);

    const hourRules = deriveHourRuleSet(makeCelebration(), rules, 'prime');

    expect(hourRules.minorHoursSineAntiphona).toBe(true);
  });

  it('applies Matins omit directives', () => {
    const rules = makeCelebrationRuleSet(['Omit ad Matutinum Incipit Invitatorium Hymnus']);

    const hourRules = deriveHourRuleSet(makeCelebration(), rules, 'matins');

    expect(hourRules.omit).toEqual(expect.arrayContaining(['incipit', 'invitatorium', 'hymnus']));
  });

  it('derives the secret Pater totum secreto lesson introduction for Matins', () => {
    const rules = makeCelebrationRuleSet(['Limit Benedictiones Oratio']);

    const hourRules = deriveHourRuleSet(makeCelebration(), rules, 'matins');

    expect(hourRules.matinsLessonIntroduction).toBe('pater-totum-secreto');
  });
});

function makeCelebration(): Celebration {
  return {
    feastRef: {
      path: 'Sancti/08-29',
      id: 'Sancti/08-29',
      title: 'Decollatio S. Ioannis Baptistae'
    },
    rank: {
      name: 'II classis',
      classSymbol: 'II',
      weight: 900
    },
    source: 'sanctoral'
  };
}

function makeCelebrationRuleSet(lines: readonly string[]): CelebrationRuleSet {
  const directives = lines.map(parseDirective);

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
    hourScopedDirectives: directives.map((directive) => ({ directive }))
  };
}

function parseDirective(line: string): RuleDirective {
  const directive = parseRuleLine(line);
  if (!directive) {
    throw new Error(`Unable to parse rule directive: ${line}`);
  }

  return directive;
}
