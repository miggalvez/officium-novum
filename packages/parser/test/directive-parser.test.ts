import { describe, expect, it } from 'vitest';

import {
  contractTrailingLines,
  lexSourceLine,
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

  it('preserves ranged psalm selectors on inline psalm references', () => {
    expect(parseDirectiveLine('In servis suis * miserébitur Dóminus.;;226(1-27)')).toEqual({
      type: 'psalmRef',
      psalmNumber: 226,
      selector: '226(1-27)',
      antiphon: 'In servis suis * miserébitur Dóminus.'
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
      substitutions: [],
      isPreamble: false
    });

    expect(parseCrossReference('@Tempora/Pent01-1:__preamble')).toEqual({
      path: 'Tempora/Pent01-1',
      section: '__preamble',
      lineSelector: undefined,
      substitutions: [],
      isPreamble: true
    });
  });

  it('parses an empty section between two colons before a substitution', () => {
    // `@PATH::sub` (used by the Easter Octave Tempora files to inherit the
    // preceding-day's `[Ant Matutinum]` while stripping its V/R lines)
    // semantically inherits the surrounding section name. The trailing
    // colon must collapse to an undefined section so the resolver picks
    // up the current section context.
    expect(
      parseCrossReference('@Tempora/Pasc0-0::s/^V\\..*//sm')
    ).toEqual({
      path: 'Tempora/Pasc0-0',
      section: undefined,
      lineSelector: undefined,
      substitutions: [
        {
          pattern: '^V\\..*',
          replacement: '',
          flags: 'sm'
        }
      ],
      isPreamble: false
    });
  });

  it('parses selector plus chained substitutions', () => {
    expect(
      parseCrossReference('@Tempora/Adv1-0o:Lectio3:1-3 s/-15/-11/ s/.$/./')
    ).toEqual({
      path: 'Tempora/Adv1-0o',
      section: 'Lectio3',
      lineSelector: { type: 'range', start: 1, end: 3 },
      substitutions: [
        {
          pattern: '-15',
          replacement: '-11',
          flags: ''
        },
        {
          pattern: '.$',
          replacement: '.',
          flags: ''
        }
      ],
      isPreamble: false
    });
  });

  it('parses substitutions after a spaced section delimiter', () => {
    expect(parseCrossReference('@:Versum Nona: s/[\\,\\.] al.*/./ig')).toEqual({
      path: undefined,
      section: 'Versum Nona',
      lineSelector: undefined,
      substitutions: [
        {
          pattern: '[\\,\\.] al.*',
          replacement: '.',
          flags: 'ig'
        }
      ],
      isPreamble: false
    });
  });
});

describe('lexSourceLine', () => {
  it('extracts inline rubric segments from a text line', () => {
    const lexed = lexSourceLine('/:Fit reverentia:/ Sanctus, Sanctus');
    expect(lexed).toEqual({
      kind: 'content',
      nodes: [
        { type: 'rubric', value: 'Fit reverentia' },
        { type: 'text', value: 'Sanctus, Sanctus' }
      ]
    });
  });

  it('splits interior inline rubrics around running text', () => {
    const lexed = lexSourceLine(
      'quia peccavi nimis: /:percutit sibi pectus:/ mea culpa.'
    );
    expect(lexed.kind).toBe('content');
    if (lexed.kind !== 'content') return;
    expect(lexed.nodes).toEqual([
      { type: 'text', value: 'quia peccavi nimis:' },
      { type: 'rubric', value: 'percutit sibi pectus' },
      { type: 'text', value: 'mea culpa.' }
    ]);
  });

  it('parses a standalone rubric-delimited line as a single rubric node', () => {
    const lexed = lexSourceLine('/:secreto:/');
    expect(lexed).toEqual({
      kind: 'content',
      nodes: [{ type: 'rubric', value: 'secreto' }]
    });
  });

  it('preserves a terminal colon inside ::/ inline rubric payloads', () => {
    const lexed = lexSourceLine(
      '/:Si Matutinum a Laudibus separatur, tunc dicitur secreto::/'
    );
    expect(lexed).toEqual({
      kind: 'content',
      nodes: [
        {
          type: 'rubric',
          value: 'Si Matutinum a Laudibus separatur, tunc dicitur secreto:'
        }
      ]
    });
  });

  it('treats a parenthesized-only line as a bare condition', () => {
    const lexed = lexSourceLine('(sed rubrica 196 aut rubrica 1955 omittuntur)');
    expect(lexed.kind).toBe('bareCondition');
    if (lexed.kind !== 'bareCondition') return;
    expect(lexed.condition.stopword).toBe('sed');
    expect(lexed.condition.instruction).toBe('omittuntur');
    expect(lexed.condition.expression).toEqual({
      type: 'or',
      left: { type: 'match', subject: 'rubrica', predicate: '196' },
      right: { type: 'match', subject: 'rubrica', predicate: '1955' }
    });
  });

  it('attaches a leading parenthesized condition to the directive that follows', () => {
    const lexed = lexSourceLine('(rubrica altovadensis) $rubrica Incipit');
    expect(lexed.kind).toBe('content');
    if (lexed.kind !== 'content') return;
    expect(lexed.leadingCondition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: 'altovadensis'
    });
    expect(lexed.nodes).toEqual([{ type: 'formulaRef', name: 'rubrica Incipit' }]);
  });

  it('falls back to raw text when a parenthesized prefix is not a valid condition', () => {
    const lexed = lexSourceLine('(Tunc, detecto Calice, dicit:) Amen');
    expect(lexed.kind).toBe('content');
    if (lexed.kind !== 'content') return;
    expect(lexed.leadingCondition).toBeUndefined();
    expect(lexed.nodes).toEqual([
      { type: 'text', value: '(Tunc, detecto Calice, dicit:) Amen' }
    ]);
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

  it('applies the same conditional preprocessing as parseFile', () => {
    const parsed = parseDirectiveLines([
      '$rubrica Secreto',
      '$Pater noster',
      '(sed rubrica 196 omittitur)'
    ]);

    expect(parsed).toEqual([
      {
        type: 'conditional',
        condition: {
          expression: {
            type: 'not',
            inner: { type: 'match', subject: 'rubrica', predicate: '196' }
          }
        },
        content: [
          { type: 'formulaRef', name: 'rubrica Secreto' },
          { type: 'formulaRef', name: 'Pater noster' }
        ],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ]);
  });
});
