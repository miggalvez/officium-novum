import { describe, expect, it } from 'vitest';

import {
  contractTrailingLines,
  parseCrossReference,
  parseDirectiveLine,
  parseDirectiveLines,
  parseLineSelector,
  parseSubstitution
} from '../src/parser/directive-parser.js';
import { splitSections } from '../src/parser/section-splitter.js';
import { loadFixture } from './fixture-loader.js';

describe('parseDirectiveLine', () => {
  it('parses cross-reference directives from fixture variants', async () => {
    const content = await loadFixture('cross-references.txt');
    const sections = splitSections(content);
    const lines = sections[0].lines.map((line) => line.text).filter((line) => line.trim().length > 0);

    const parsed = lines.map((line) => parseDirectiveLine(line));
    expect(parsed).toMatchSnapshot();
  });

  it('parses psalm refs, macros, formulae, verse markers, and gabc notation', async () => {
    const content = await loadFixture('psalter-entry.txt');
    const sections = splitSections(content);

    const parsed = sections
      .flatMap((section) => section.lines)
      .map((line) => line.text)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseDirectiveLine(line));

    expect(parsed).toMatchSnapshot();
  });

  it('distinguishes citations from rubrical ! directives', () => {
    expect(parseDirectiveLine('!Act 9:1-5')).toEqual({
      type: 'citation',
      value: 'Act 9:1-5'
    });

    expect(parseDirectiveLine('!Commemoratio S. Petri')).toEqual({
      type: 'rubric',
      value: 'Commemoratio S. Petri'
    });
  });

  it('strips leading escape marker and treats remainder as plain text', () => {
    expect(parseDirectiveLine('~literal ;;99')).toEqual({
      type: 'text',
      value: 'literal ;;99'
    });
  });

  it('parses Responsorium. as a verse marker prefix', () => {
    expect(parseDirectiveLine('Responsorium. Repléti sunt omnes Spíritu sancto')).toEqual({
      type: 'verseMarker',
      marker: 'Responsorium.',
      text: 'Repléti sunt omnes Spíritu sancto'
    });
  });

  it('parses metadata-style GABC notation blocks', () => {
    expect(
      parseDirectiveLine('{name:Amen;annotation:Simplex;%%(c3) A(h)men.(h.) (::)}')
    ).toEqual({
      type: 'gabcNotation',
      notation: {
        kind: 'inline',
        notation: '{name:Amen;annotation:Simplex;%%(c3) A(h)men.(h.) (::)}'
      }
    });
  });

  it('strips trailing contraction markers from single lines', () => {
    expect(parseDirectiveLine('~(Tunc, detecto Calice, dicit:)~')).toEqual({
      type: 'text',
      value: '(Tunc, detecto Calice, dicit:)'
    });

    expect(parseDirectiveLine('v. Laudámus te,~')).toEqual({
      type: 'verseMarker',
      marker: 'v.',
      text: 'Laudámus te,'
    });
  });
});

describe('cross-reference parsers', () => {
  it('parses line selectors and substitutions explicitly', () => {
    expect(parseLineSelector('!2-5')).toEqual({ type: 'inverse', start: 2, end: 5 });
    expect(parseSubstitution('s/OLD/NEW/gi')).toEqual({
      pattern: 'OLD',
      replacement: 'NEW',
      flags: 'gi'
    });
  });

  it('throws on malformed selector tokens', () => {
    expect(() => parseLineSelector('!A-2')).toThrowError(/Invalid line selector/);
  });

  it('parses section-only and preamble references', () => {
    expect(parseCrossReference('@:Commemoratio')).toEqual({
      path: undefined,
      section: 'Commemoratio',
      lineSelector: undefined,
      substitution: undefined,
      isPreamble: false
    });

    expect(parseCrossReference('@Tempora/Pent01-1:__preamble')).toEqual({
      path: 'Tempora/Pent01-1',
      section: '__preamble',
      lineSelector: undefined,
      substitution: undefined,
      isPreamble: true
    });
  });
});

describe('line contraction helpers', () => {
  it('contracts lines ending in ~ with the following line', () => {
    const merged = contractTrailingLines([
      'v. Eu me confesso a Deus, todo-poderoso, ~',
      'ao bem-aventurado S. Miguel Arcanjo, ~',
      'ao bem-aventurado S. João Baptista.',
      'R. Amen.'
    ]);

    expect(merged).toEqual([
      'v. Eu me confesso a Deus, todo-poderoso, ao bem-aventurado S. Miguel Arcanjo, ao bem-aventurado S. João Baptista.',
      'R. Amen.'
    ]);
  });

  it('parses contracted lines end-to-end', () => {
    const parsed = parseDirectiveLines([
      'v. Dignum et justum est~',
      'in omni tempore.',
      'R. Amen.'
    ]);

    expect(parsed).toEqual([
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Dignum et justum estin omni tempore.'
      },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Amen.'
      }
    ]);
  });
});
