import { describe, expect, it } from 'vitest';

import type { TextContent } from '@officium-novum/parser';
import type { ConditionEvalContext } from '@officium-novum/rubrical-engine';

import { flattenConditionals } from '../src/flatten/evaluate-conditionals.js';

const baseContext: ConditionEvalContext = {
  date: { year: 2024, month: 4, day: 14 },
  dayOfWeek: 0,
  season: 'eastertide',
  version: {
    handle: 'Rubrics 1960' as never,
    kalendar: 'General-1960',
    transfer: 'General-1960',
    stransfer: 'General-1960',
    policy: {} as never
  }
};

describe('flattenConditionals', () => {
  it('keeps non-conditional nodes untouched', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Alpha' },
      { type: 'separator' }
    ];
    expect(flattenConditionals(content, baseContext)).toEqual(content);
  });

  it('splices in conditionals whose predicate matches', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Alpha' },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'tempore', predicate: 'Paschali' }
        },
        content: [{ type: 'text', value: 'alleluia' }]
      }
    ];
    const result = flattenConditionals(content, baseContext);
    expect(result).toEqual([
      { type: 'text', value: 'Alpha' },
      { type: 'text', value: 'alleluia' }
    ]);
  });

  it('drops conditionals whose predicate does not match', () => {
    const content: TextContent[] = [
      { type: 'text', value: 'Alpha' },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'tempore', predicate: 'Adventus' }
        },
        content: [{ type: 'text', value: 'in adventu' }]
      }
    ];
    const result = flattenConditionals(content, baseContext);
    expect(result).toEqual([{ type: 'text', value: 'Alpha' }]);
  });
});
