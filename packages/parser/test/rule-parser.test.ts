import { describe, expect, it } from 'vitest';

import { parseRuleLine, parseRuleSection } from '../src/parser/rule-parser.js';
import { splitSections } from '../src/parser/section-splitter.js';
import { loadFixture } from './fixture-loader.js';

describe('parseRuleLine', () => {
  it('parses assignment, reference, and action directives', () => {
    expect(parseRuleLine('Commemoratio=Sancti/06-29')).toEqual({
      kind: 'assignment',
      key: 'Commemoratio',
      value: 'Sancti/06-29',
      condition: undefined,
      raw: 'Commemoratio=Sancti/06-29'
    });

    expect(parseRuleLine('@Commune/C1:Rule')).toEqual({
      kind: 'reference',
      reference: {
        path: 'Commune/C1',
        section: 'Rule',
        lineSelector: undefined,
        substitution: undefined,
        isPreamble: false
      },
      condition: undefined,
      raw: '@Commune/C1:Rule'
    });

    expect(parseRuleLine('Gloria omittitur')).toEqual({
      kind: 'action',
      keyword: 'Gloria',
      args: ['omittitur'],
      condition: undefined,
      raw: 'Gloria omittitur'
    });
  });

  it('ignores blank and comment-only lines', () => {
    expect(parseRuleLine('')).toBeNull();
    expect(parseRuleLine('   # ignored')).toBeNull();
  });
});

describe('parseRuleSection', () => {
  it('parses complex fixture directives including prefixed and suffixed conditions', async () => {
    const content = await loadFixture('rule-directives.txt');
    const section = splitSections(content).find((candidate) => candidate.header === 'Rule');

    expect(section).toBeDefined();

    const parsed = parseRuleSection(
      (section?.lines ?? []).map((line) => ({
        text: line.text,
        lineNumber: line.lineNumber
      }))
    );

    expect(parsed).toMatchSnapshot();
    expect(parsed[3]).toMatchObject({
      kind: 'action',
      keyword: 'Gloria'
    });
    expect(parsed[3]).toHaveProperty('condition');
    expect(parsed[4]).toMatchObject({
      kind: 'action',
      keyword: 'Credo'
    });
  });
});
