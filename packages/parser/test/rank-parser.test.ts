import { describe, expect, it } from 'vitest';

import { parseCondition } from '../src/parser/condition-parser.js';
import { parseRankLine, parseRankSection } from '../src/parser/rank-parser.js';
import { splitSections } from '../src/parser/section-splitter.js';
import { loadFixture } from './fixture-loader.js';

describe('parseRankLine', () => {
  it('parses title, rank name, class weight, and derivation', () => {
    const parsed = parseRankLine('S. Polycarpi;;Duplex;;5.0;;ex Commune/C9');

    expect(parsed).toEqual({
      title: 'S. Polycarpi',
      rank: {
        name: 'Duplex',
        classWeight: 5,
        derivation: 'ex Commune/C9',
        condition: undefined
      },
      raw: 'S. Polycarpi;;Duplex;;5.0;;ex Commune/C9'
    });
  });

  it('throws when required fields are missing', () => {
    expect(() => parseRankLine('Incomplete;;Duplex')).toThrowError(/at least three fields/);
  });

  it('accepts empty feast titles used in upstream rank files', () => {
    const parsed = parseRankLine(';;Duplex majus;;4;;ex Sancti/06-30');

    expect(parsed).toEqual({
      title: '',
      rank: {
        name: 'Duplex majus',
        classWeight: 4,
        derivation: 'ex Sancti/06-30',
        condition: undefined
      },
      raw: ';;Duplex majus;;4;;ex Sancti/06-30'
    });
  });
});

describe('parseRankSection', () => {
  it('parses multiple rank variants with section-level conditions', async () => {
    const content = await loadFixture('rank-variants.txt');
    const sections = splitSections(content).filter((section) => section.header === 'Rank');

    const parsed = sections.flatMap((section) =>
      parseRankSection(
        section.lines.map((line) => ({ text: line.text, lineNumber: line.lineNumber })),
        {
          condition: section.condition ? parseCondition(section.condition) : undefined
        }
      )
    );

    expect(parsed).toMatchSnapshot();
    expect(parsed[0].rank.classWeight).toBe(7);
    expect(parsed[2].rank.condition?.expression.type).toBe('match');
    expect(parsed[2].rank.condition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: '1960'
    });
  });

  it('applies standalone parenthesized condition lines to the next rank line', async () => {
    const content = await loadFixture('rank-interleaved.txt');
    const section = splitSections(content).find((candidate) => candidate.header === 'Rank');
    expect(section).toBeDefined();

    const parsed = parseRankSection(
      (section?.lines ?? []).map((line) => ({ text: line.text, lineNumber: line.lineNumber }))
    );

    expect(parsed).toMatchSnapshot();
    expect(parsed).toHaveLength(3);
    expect(parsed[0].rank.condition).toBeUndefined();
    expect(parsed[1].rank.condition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: 'innovata'
    });
    expect(parsed[2].rank.condition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: 'cisterciensis'
    });
  });
});
