import { parseFile } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { buildCelebrationRuleSet } from '../../src/rules/evaluate.js';
import {
  asVersionHandle,
  type Commemoration,
  type RuleEvaluationContext,
  type ResolvedVersion
} from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('buildCelebrationRuleSet', () => {
  it('maps a single directive to the expected celebration slot', () => {
    const { feastFile, context } = makeHarness(['No secunda Vespera']);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.hasSecondVespers).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('maps multiple directives in one pass', () => {
    const { feastFile, context } = makeHarness([
      '9 lectiones',
      'Antiphonas horas',
      'Doxology=Nat',
      'Sub unica concl',
      'Psalm5 Vespera=116'
    ]);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.matins.lessonCount).toBe(9);
    expect(result.celebrationRules.antiphonScheme).toBe('proper-minor-hours');
    expect(result.celebrationRules.doxologyVariant).toBe('Nat');
    expect(result.celebrationRules.conclusionMode).toBe('sub-unica');
    expect(result.celebrationRules.hourScopedDirectives).toHaveLength(1);
  });

  it('honors true conditional directives', () => {
    const { feastFile, context } = makeHarness(['(rubrica 1960 et feria dominica) No prima Vespera']);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.hasFirstVespers).toBe(false);
  });

  it('skips false conditional directives', () => {
    const { feastFile, context } = makeHarness(['(feria vi) No prima Vespera']);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.hasFirstVespers).toBe(true);
  });

  it('inherits ex rules and lets feast overrides win', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/08-29.txt',
      ['[Rule]', 'ex Sancti/08-28;', 'Doxology=Corp'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/08-28.txt',
      ['[Rule]', 'Doxology=Nat', '9 lectiones'].join('\n')
    );

    const feastFile = parseFile(
      ['[Rule]', 'ex Sancti/08-28;', 'Doxology=Corp'].join('\n'),
      'horas/Latin/Sancti/08-29.txt'
    );
    const context = makeContext(corpus, 'Sancti/08-29');

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.doxologyVariant).toBe('Corp');
    expect(result.celebrationRules.matins.lessonCount).toBe(9);
  });

  it('applies vide as selective fallback', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/01-02.txt',
      ['[Rule]', 'vide Sancti/01-01', '9 lectiones'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/01-01.txt',
      ['[Rule]', '9 lectiones', 'Doxology=Nat'].join('\n')
    );

    const feastFile = parseFile(
      ['[Rule]', 'vide Sancti/01-01', '9 lectiones'].join('\n'),
      'horas/Latin/Sancti/01-02.txt'
    );
    const context = makeContext(corpus, 'Sancti/01-02');

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.matins.lessonCount).toBe(9);
    expect(result.celebrationRules.doxologyVariant).toBe('Nat');
  });

  it('routes commemorated Lectio9 when no explicit override exists', () => {
    const { feastFile, context } = makeHarness(['9 lectiones']);
    const commemorations: readonly Commemoration[] = [
      {
        feastRef: {
          path: 'Sancti/04-14',
          id: 'Sancti/04-14',
          title: 'S. Example'
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

    const result = buildCelebrationRuleSet(feastFile, commemorations, {
      ...context,
      commemorations
    });

    expect(result.celebrationRules.lessonSources).toContainEqual({
      lesson: 9,
      source: 'commemorated-principal'
    });
  });

  it('collects unmapped directives with warnings', () => {
    const { feastFile, context } = makeHarness(['Symbolum Athanasium']);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.unmapped).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'rule-unmapped'
      })
    );
  });

  it('classifies missa pass-through directives distinctly', () => {
    const { feastFile, context } = makeHarness(['Credo', 'Prefatio=Nat']);

    const result = buildCelebrationRuleSet(feastFile, [], context);

    expect(result.celebrationRules.unmapped).toEqual([]);
    expect(result.warnings.filter((warning) => warning.code === 'rule-missa-passthrough')).toHaveLength(2);
  });
});

function makeHarness(rules: readonly string[]) {
  const corpus = new TestOfficeTextIndex();
  const path = 'horas/Latin/Sancti/08-29.txt';
  const content = ['[Rule]', ...rules].join('\n');
  corpus.add(path, content);

  return {
    feastFile: parseFile(content, path),
    context: makeContext(corpus, 'Sancti/08-29')
  };
}

function makeContext(corpus: TestOfficeTextIndex, canonicalPath: string): RuleEvaluationContext {
  const policy = makeTestPolicy('rubrics-1960');
  const version: ResolvedVersion = {
    handle: asVersionHandle('Rubrics 1960 - 1960'),
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    policy
  };

  return {
    date: { year: 2024, month: 8, day: 29 },
    dayOfWeek: 0,
    season: 'time-after-pentecost',
    version,
    dayName: 'Pent13-0',
    celebration: {
      feastRef: {
        path: canonicalPath,
        id: canonicalPath,
        title: canonicalPath
      },
      rank: {
        name: 'II classis',
        classSymbol: 'II',
        weight: 900
      },
      source: canonicalPath.startsWith('Tempora/') ? 'temporal' : 'sanctoral'
    },
    commemorations: [],
    corpus
  };
}
