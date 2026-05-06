import { describe, expect, it } from 'vitest';

import { parseFile } from '../src/parser/parse-file.js';
import type { TextContent } from '../src/types/schema.js';

describe('parseFile section content', () => {
  it('wraps a preceding block in not(condition) when a `sed X omittuntur` line closes it', () => {
    const content = [
      '[Incipit]',
      '$rubrica Secreto',
      '$Pater noster',
      '$Ave Maria',
      '(sed rubrica 196 aut rubrica 1955 omittuntur)',
      '$Domine labia'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/Ordinarium/Matutinum.txt');
    const incipit = file.sections.find((section) => section.header === 'Incipit');
    expect(incipit).toBeDefined();
    const [wrapped, tail] = incipit!.content;
    expect(wrapped).toMatchObject({
      type: 'conditional',
      condition: {
        expression: {
          type: 'not',
          inner: {
            type: 'or',
            left: { type: 'match', subject: 'rubrica', predicate: '196' },
            right: { type: 'match', subject: 'rubrica', predicate: '1955' }
          }
        }
      }
    });
    if (wrapped.type !== 'conditional') throw new Error('expected conditional');
    const wrappedRefs = wrapped.content.filter(
      (node): node is Extract<TextContent, { type: 'formulaRef' | 'macroRef' }> =>
        node.type === 'formulaRef' || node.type === 'macroRef'
    );
    expect(wrappedRefs).toEqual([
      { type: 'formulaRef', name: 'rubrica Secreto' },
      { type: 'formulaRef', name: 'Pater noster' },
      { type: 'formulaRef', name: 'Ave Maria' }
    ]);
    expect(tail).toEqual({ type: 'formulaRef', name: 'Domine labia' });
  });

  it('walks the trailing block past a `_` separator (Matins incipit shape)', () => {
    const content = [
      '[Section]',
      '$first',
      '_',
      '$second',
      '(sed rubrica 196 omittitur)'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toHaveLength(1);
    expect(section.content[0]).toMatchObject({
      type: 'conditional',
      content: [
        { type: 'formulaRef', name: 'first' },
        { type: 'separator' },
        { type: 'formulaRef', name: 'second' }
      ]
    });
  });

  it('stops the trailing-block walkback at a `#Heading` boundary', () => {
    const content = [
      '#Section A',
      '$first',
      '#Section B',
      '$second',
      '(sed rubrica 196 omittitur)'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const preamble = file.sections.find((section) => section.header === '__preamble')!;
    const conditionals = preamble.content.filter((node) => node.type === 'conditional');
    expect(conditionals).toHaveLength(1);
    expect(conditionals[0]).toMatchObject({
      type: 'conditional',
      content: [{ type: 'formulaRef', name: 'second' }]
    });
  });

  it('wraps a leading `(rubrica X)` prefix as a conditional around the rest of the line', () => {
    const content = ['[Section]', '(rubrica altovadensis) $rubrica Incipit'].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toHaveLength(1);
    expect(section.content[0]).toMatchObject({
      type: 'conditional',
      condition: {
        expression: { type: 'match', subject: 'rubrica', predicate: 'altovadensis' }
      },
      content: [{ type: 'formulaRef', name: 'rubrica Incipit' }]
    });
  });

  it('applies a `sed X` alternation: preceding becomes not(X), following becomes X', () => {
    const content = [
      '[Section]',
      '&Deus_in_adjutorium',
      '(sed rubrica cisterciensis)',
      '$Deus in adjutorium tantum'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;

    expect(section.content).toHaveLength(2);
    expect(section.content[0]).toMatchObject({
      type: 'conditional',
      condition: {
        expression: {
          type: 'not',
          inner: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
        }
      },
      content: [{ type: 'macroRef', name: 'Deus_in_adjutorium' }]
    });
    expect(section.content[1]).toMatchObject({
      type: 'conditional',
      condition: {
        expression: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
      },
      content: [{ type: 'formulaRef', name: 'Deus in adjutorium tantum' }]
    });
  });

  it('binds a bare `deinde ... dicitur` condition to the following line', () => {
    const content = [
      '[Section]',
      '$Alleluia',
      '(deinde rubrica monastica dicitur)',
      '$Domine labia'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toEqual([
      { type: 'formulaRef', name: 'Alleluia' },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'rubrica', predicate: 'monastica' },
          stopword: 'deinde',
          instruction: 'dicitur'
        },
        content: [{ type: 'formulaRef', name: 'Domine labia' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ]);
  });

  it('treats named-day `sed ... dicitur` as an additive following-line condition', () => {
    const content = [
      '[Ant Matutinum]',
      'Afférte Dómino, fílii Dei, * adoráte Dóminum in aula sancta ejus.;;28',
      '(sed die Epiphaniæ dicitur)',
      'Veníte adorémus eum: * quia ipse est Dóminus Deus noster.;;94',
      'Adoráte Dóminum, * allelúja: in aula sancta ejus, allelúja.;;95'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;

    expect(section.content).toEqual([
      {
        type: 'psalmRef',
        psalmNumber: 28,
        antiphon: 'Afférte Dómino, fílii Dei, * adoráte Dóminum in aula sancta ejus.'
      },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'die', predicate: 'Epiphaniæ' },
          stopword: 'sed',
          instruction: 'dicitur'
        },
        content: [
          {
            type: 'psalmRef',
            psalmNumber: 94,
            antiphon: 'Veníte adorémus eum: * quia ipse est Dóminus Deus noster.'
          }
        ],
        scope: { backwardLines: 0, forwardMode: 'line' }
      },
      {
        type: 'psalmRef',
        psalmNumber: 95,
        antiphon: 'Adoráte Dóminum, * allelúja: in aula sancta ejus, allelúja.'
      }
    ]);
  });

  it('keeps a following-line condition active across an intervening `_` separator', () => {
    const content = [
      '[Section]',
      '(deinde rubrica monastica dicuntur)',
      '_',
      '&psalm(3)'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toEqual([
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'rubrica', predicate: 'monastica' },
          stopword: 'deinde',
          instruction: 'dicuntur'
        },
        content: [{ type: 'separator' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'rubrica', predicate: 'monastica' },
          stopword: 'deinde',
          instruction: 'dicuntur'
        },
        content: [{ type: 'psalmInclude', psalmNumber: 3 }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ]);
  });

  it('splits inline /:rubric:/ segments while keeping surrounding text on the same section', () => {
    const content = [
      '[Confiteor]',
      'v. Confíteor Deo omnipoténti: /:percutit sibi pectus:/ mea culpa.'
    ].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toEqual([
      { type: 'verseMarker', marker: 'v.', text: 'Confíteor Deo omnipoténti:' },
      { type: 'rubric', value: 'percutit sibi pectus' },
      { type: 'text', value: 'mea culpa.' }
    ]);
  });

  it('drops a `(deinde dicitur)` metadata connector without emitting raw text', () => {
    const content = ['[Section]', '(deinde dicitur)', '$Domine labia'].join('\n');

    const file = parseFile(content, 'horas/Latin/test.txt');
    const section = file.sections[0]!;
    expect(section.content).toEqual([{ type: 'formulaRef', name: 'Domine labia' }]);
  });
});
