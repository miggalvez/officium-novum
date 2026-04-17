import { parseCondition, type TextContent } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { evaluateConditionalBlock, type RuleEvalContext } from '../../src/rules/apply-conditionals.js';
import { asVersionHandle, type CelebrationRuleSet, type ResolvedVersion } from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('evaluateConditionalBlock', () => {
  it('includes content when the conditional matches', () => {
    const content: readonly TextContent[] = [
      { type: 'text', value: 'Always kept' },
      {
        type: 'conditional',
        condition: parseCondition('feria dominica'),
        content: [{ type: 'text', value: 'Sunday only' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ];

    const result = evaluateConditionalBlock(content, makeContext());

    expect(result).toEqual([
      { type: 'text', value: 'Always kept' },
      { type: 'text', value: 'Sunday only' }
    ]);
  });

  it('excludes content when the conditional does not match', () => {
    const content: readonly TextContent[] = [
      {
        type: 'conditional',
        condition: parseCondition('feria vi'),
        content: [{ type: 'text', value: 'Friday only' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      },
      { type: 'text', value: 'Always kept' }
    ];

    const result = evaluateConditionalBlock(content, makeContext());

    expect(result).toEqual([{ type: 'text', value: 'Always kept' }]);
  });

  it('flattens nested conditionals recursively', () => {
    const content: readonly TextContent[] = [
      {
        type: 'conditional',
        condition: parseCondition('rubrica 1960'),
        content: [
          { type: 'text', value: 'Rubrics 1960' },
          {
            type: 'conditional',
            condition: parseCondition('tempore paschali'),
            content: [{ type: 'text', value: 'Paschaltide' }],
            scope: { backwardLines: 0, forwardMode: 'line' }
          }
        ],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ];

    const result = evaluateConditionalBlock(content, makeContext());

    expect(result).toEqual([
      { type: 'text', value: 'Rubrics 1960' },
      { type: 'text', value: 'Paschaltide' }
    ]);
  });
});

function makeContext(): RuleEvalContext {
  const policy = makeTestPolicy('rubrics-1960');
  const version: ResolvedVersion = {
    handle: asVersionHandle('Rubrics 1960 - 1960'),
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    policy
  };

  return {
    date: { year: 2024, month: 4, day: 14 },
    dayOfWeek: 0,
    season: 'eastertide',
    version,
    dayName: 'Pasc2-0',
    celebration: {
      feastRef: {
        path: 'Tempora/Pasc2-0',
        id: 'Tempora/Pasc2-0',
        title: 'Dominica II post Pascha'
      },
      rank: {
        name: 'I classis',
        classSymbol: 'I',
        weight: 1000
      },
      source: 'temporal'
    },
    commemorations: [],
    celebrationRules: makeRuleSet(),
    corpus: new TestOfficeTextIndex()
  };
}

function makeRuleSet(): CelebrationRuleSet {
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
