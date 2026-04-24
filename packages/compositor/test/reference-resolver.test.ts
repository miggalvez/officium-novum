import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';

import {
  materializeInvitatoryContent,
  resolveReference,
  swapLanguageSegment
} from '../src/resolve/reference-resolver.js';

function fakeFile(path: string, header: string, value: string): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: [
      {
        header,
        content: [{ type: 'text', value }],
        startLine: 1,
        endLine: 1
      }
    ]
  };
}

describe('swapLanguageSegment', () => {
  it('swaps the Latin segment for horas/ paths', () => {
    expect(swapLanguageSegment('horas/Latin/Commune/C4', 'English')).toBe(
      'horas/English/Commune/C4'
    );
  });

  it('swaps the Latin segment for missa/ paths', () => {
    expect(swapLanguageSegment('missa/Latin/Sancti/01-01', 'Italiano')).toBe(
      'missa/Italiano/Sancti/01-01'
    );
  });

  it('is a no-op for Latin', () => {
    expect(swapLanguageSegment('horas/Latin/Commune/C4', 'Latin')).toBe(
      'horas/Latin/Commune/C4'
    );
  });
  it('extracts the Tridentinum antiphon text from #antiphon selectors', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Tridentinum',
          content: [
            {
              type: 'text',
              value: 'Prima Festis=Allelúja, * allelúja, allelúja;;53,118(1-16),118(17-32)'
            }
          ],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Tridentinum',
        selector: 'Prima Festis#antiphon'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content).toEqual([
      { type: 'text', value: 'Allelúja, * allelúja, allelúja' }
    ]);
  });

  it('materializes Sunday Tridentinum antiphons from the keyed minor-hour sections', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Tridentinum',
          content: [
            {
              type: 'text',
              value: 'Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)'
            }
          ],
          startLine: 1,
          endLine: 1
        },
        {
          header: 'Tertia',
          content: [
            {
              type: 'text',
              value:
                'Dominica = Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.'
            }
          ],
          startLine: 2,
          endLine: 2
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Tridentinum',
        selector: 'Tertia Dominica#antiphon'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content).toEqual([
      {
        type: 'text',
        value: 'Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.'
      }
    ]);
  });

  it('trims the first Psalm 94 tail segment for Invit2 materialization before antiphon insertion', () => {
    const materialized = materializeInvitatoryContent(
      [
        { type: 'formulaRef', name: 'ant' },
        {
          type: 'verseMarker',
          marker: 'v.',
          text: 'Veníte, exsultémus Dómino, + jubilémus Deo, salutári nostro: * præoccupémus fáciem ejus in confessióne, et in psalmis jubilémus ei.'
        },
        { type: 'formulaRef', name: 'ant2' }
      ],
      [{ type: 'text', value: 'Præoccupémus fáciem Dómini: * Et in psalmis jubilémus ei.' }],
      'Invit2'
    );

    expect(materialized).toEqual([
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Præoccupémus fáciem Dómini: * Et in psalmis jubilémus ei.'
      },
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Veníte, exsultémus Dómino, + jubilémus Deo, salutári nostro:'
      },
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Et in psalmis jubilémus ei.'
      }
    ]);
  });

  it('materializes the Passiontide invitatory tail and Gloria omission before antiphon insertion', () => {
    const materialized = materializeInvitatoryContent(
      [
        { type: 'formulaRef', name: 'ant' },
        {
          type: 'verseMarker',
          marker: 'v.',
          text: 'Hódie, si vocem ejus audiéritis, nolíte obduráre corda vestra, ^ sicut in exacerbatióne secúndum diem tentatiónis in desérto.'
        },
        { type: 'formulaRef', name: 'ant2' },
        {
          type: 'verseMarker',
          marker: 'v.',
          text: 'Quadragínta annis próximus fui generatióni huic.'
        },
        { type: 'formulaRef', name: 'ant' },
        { type: 'macroRef', name: 'Gloria' },
        { type: 'formulaRef', name: 'ant2' },
        { type: 'formulaRef', name: 'ant' }
      ],
      [{ type: 'text', value: 'Hódie, si vocem Dómini audiéritis, * Nolíte obduráre corda vestra.' }],
      'Invit3'
    );

    expect(materialized).toEqual([
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Hódie, si vocem Dómini audiéritis, * Nolíte obduráre corda vestra.'
      },
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Sicut in exacerbatióne secúndum diem tentatiónis in desérto.'
      },
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Nolíte obduráre corda vestra.'
      },
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Quadragínta annis próximus fui generatióni huic.'
      },
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Hódie, si vocem Dómini audiéritis, * Nolíte obduráre corda vestra.'
      },
      { type: 'formulaRef', name: 'Gloria omittitur' },
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Hódie, si vocem Dómini audiéritis, * Nolíte obduráre corda vestra.'
      }
    ]);
  });
});

describe('resolveReference', () => {
  it('returns the requested language when present', () => {
    const index = new InMemoryTextIndex();
    index.addFile(fakeFile('horas/Latin/Commune/C4', 'Hymnus', 'Te lucis'));
    index.addFile(fakeFile('horas/English/Commune/C4', 'Hymnus', 'Before the ending of the day'));

    const resolved = resolveReference(
      index,
      { path: 'horas/Latin/Commune/C4', section: 'Hymnus' },
      { languages: ['English', 'Latin'] }
    );

    expect(resolved.English?.language).toBe('English');
    expect(resolved.Latin?.language).toBe('Latin');
    expect(resolved.English?.section.content[0]).toEqual({
      type: 'text',
      value: 'Before the ending of the day'
    });
  });

  it('falls back to Latin when the requested language has no file', () => {
    const index = new InMemoryTextIndex();
    index.addFile(fakeFile('horas/Latin/Commune/C4', 'Hymnus', 'Te lucis'));

    const resolved = resolveReference(
      index,
      { path: 'horas/Latin/Commune/C4', section: 'Hymnus' },
      { languages: ['Deutsch'] }
    );

    expect(resolved.Deutsch?.language).toBe('Latin');
    expect(resolved.Deutsch?.path).toBe('horas/Latin/Commune/C4');
  });

  it('returns nothing when the section is missing everywhere', () => {
    const index = new InMemoryTextIndex();
    index.addFile(fakeFile('horas/Latin/Commune/C4', 'Hymnus', 'Te lucis'));

    const resolved = resolveReference(
      index,
      { path: 'horas/Latin/Commune/C4', section: 'OratioNonExistent' },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin).toBeUndefined();
  });

  it('extracts heading-scoped content from __preamble files such as Ordinarium', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Ordinarium/Prima.txt',
      sections: [
        {
          header: '__preamble',
          content: [
            { type: 'heading', value: 'Incipit' },
            { type: 'formulaRef', name: 'Deus in adjutorium' },
            { type: 'heading', value: 'Conclusio' },
            { type: 'formulaRef', name: 'Benedicamus Domino' }
          ],
          startLine: 1,
          endLine: 4
        }
      ]
    });

    const resolved = resolveReference(
      index,
      { path: 'horas/Ordinarium/Prima', section: 'Incipit' },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content).toEqual([{ type: 'formulaRef', name: 'Deus in adjutorium' }]);
  });

  it('expands single-number psalm selectors against Psalmorum files instead of treating them as line picks', () => {
    const index = new InMemoryTextIndex();
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm116', '__preamble', '116:1 Laudate Dominum'));

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmorum/Psalm116',
        section: '__preamble',
        selector: '116'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.selectorUnhandled).toBe(false);
    expect(resolved.Latin?.content[0]).toEqual({ type: 'text', value: '116:1 Laudate Dominum' });
  });

  it('expands comma-separated psalm selectors into all referenced psalm files', () => {
    const index = new InMemoryTextIndex();
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm62', '__preamble', '62:1 Deus Deus meus'));
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm66', '__preamble', '66:1 Deus misereatur nostri'));

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmorum/Psalm62',
        section: '__preamble',
        selector: '62,66'
      },
      { languages: ['Latin'] }
    );

    const rendered = (resolved.Latin?.content ?? [])
      .flatMap((node) => {
        if (node.type === 'text') return [node.value];
        if (node.type === 'verseMarker') return [node.text];
        return [];
      })
      .join('|');

    expect(rendered).toContain('62:1 Deus Deus meus');
    expect(rendered).toContain('66:1 Deus misereatur nostri');
  });

  it('selects weekday-keyed minor-hour psalmody instead of returning the full section', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Prima',
          content: [
            { type: 'text', value: 'Dominica = Sunday antiphon' },
            { type: 'text', value: '117' },
            { type: 'text', value: 'Feria II = Monday antiphon' },
            { type: 'text', value: '23,24' }
          ],
          startLine: 1,
          endLine: 4
        }
      ]
    });
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm23', '__preamble', '23:1 Domini est terra'));
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm24', '__preamble', '24:1 Ad te Domine levavi'));

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Prima',
        selector: 'Feria II'
      },
      { languages: ['Latin'] }
    );

    const rendered = collectTexts(resolved.Latin?.content ?? []).join('|');

    expect(rendered).toContain('Monday antiphon');
    expect(rendered).toContain('23:1 Domini est terra');
    expect(rendered).toContain('24:1 Ad te Domine levavi');
    expect(rendered).not.toContain('Sunday antiphon');
  });

  it('selects weekday-keyed minor-hour psalmody through conditional wrappers', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Prima',
          content: [
            {
              type: 'conditional',
              condition: {
                expression: {
                  type: 'not',
                  inner: { type: 'match', subject: 'rubrica', predicate: 'praedicatorum' }
                }
              },
              content: [
                { type: 'text', value: 'Feria II = Monday antiphon' },
                { type: 'text', value: '23,24' }
              ],
              scope: { backwardLines: 0, forwardMode: 'line' }
            }
          ],
          startLine: 1,
          endLine: 2
        }
      ]
    });
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm23', '__preamble', '23:1 Domini est terra'));
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm24', '__preamble', '24:1 Ad te Domine levavi'));

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Prima',
        selector: 'Feria II'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content[0]).toMatchObject({
      type: 'conditional',
      condition: {
        expression: {
          type: 'not',
          inner: { type: 'match', subject: 'rubrica', predicate: 'praedicatorum' }
        }
      }
    });
    const rendered = collectTexts(resolved.Latin?.content ?? []).join('|');
    expect(rendered).toContain('Monday antiphon');
    expect(rendered).toContain('23:1 Domini est terra');
    expect(rendered).toContain('24:1 Ad te Domine levavi');
  });

  it('extracts weekday minor-hour antiphons through conditional wrappers', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Tertia',
          content: [
            {
              type: 'conditional',
              condition: {
                expression: {
                  type: 'not',
                  inner: { type: 'match', subject: 'rubrica', predicate: 'praedicatorum' }
                }
              },
              content: [{ type: 'text', value: 'Feria IV = Misericórdia tua, * Dómine.' }],
              scope: { backwardLines: 0, forwardMode: 'line' }
            }
          ],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Tertia',
        selector: 'Feria IV#antiphon'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content).toEqual([
      { type: 'text', value: 'Misericórdia tua, * Dómine.' }
    ]);
  });

  it('selects weekday-keyed Compline psalmody from the Completorium section', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor.txt',
      sections: [
        {
          header: 'Completorium',
          content: [
            { type: 'text', value: 'Dominica = Sunday compline antiphon' },
            { type: 'text', value: '4,90,133' },
            { type: 'text', value: 'Feria II = Monday compline antiphon' },
            { type: 'text', value: '6,7(2-10),7(11-18)' }
          ],
          startLine: 1,
          endLine: 4
        }
      ]
    });
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm6', '__preamble', '6:1 Domine ne in furore'));
    index.addFile(fakeFile('horas/Latin/Psalterium/Psalmorum/Psalm7', '__preamble', '7:2 Domine Deus meus'));

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
        section: 'Completorium',
        selector: 'Feria II'
      },
      { languages: ['Latin'] }
    );

    const rendered = collectTexts(resolved.Latin?.content ?? []).join('|');
    expect(rendered).toContain('Monday compline antiphon');
    expect(rendered).toContain('6:1 Domine ne in furore');
    expect(rendered).toContain('7:2 Domine Deus meus');
    expect(rendered).not.toContain('Sunday compline antiphon');
  });

  it('injects the seasonal invitatory antiphon into the Psalm 94 skeleton', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Invitatorium.txt',
      sections: [
        {
          header: '__preamble',
          content: [
            { type: 'formulaRef', name: 'ant' },
            { type: 'verseMarker', marker: 'v.', text: 'Venite exsultemus Domino' },
            { type: 'formulaRef', name: 'ant2' }
          ],
          startLine: 1,
          endLine: 3
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Special/Matutinum Special.txt',
      sections: [
        {
          header: 'Invit Pasch',
          content: [{ type: 'text', value: 'Surrexit Dominus vere, alleluja.' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Invitatorium',
        section: '__preamble',
        selector: 'Pascha'
      },
      { languages: ['Latin'], dayOfWeek: 0 }
    );

    const rendered = (resolved.Latin?.content ?? [])
      .filter((node) => node.type === 'text' || node.type === 'verseMarker')
      .map((node) => ('value' in node ? node.value : node.text))
      .join('|');

    expect(rendered).toBe(
      'Surrexit Dominus vere, alleluja.|Venite exsultemus Domino|Surrexit Dominus vere, alleluja.'
    );
  });

  it('injects weekday-keyed invitatory antiphons through conditional wrappers', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Invitatorium.txt',
      sections: [
        {
          header: '__preamble',
          content: [
            { type: 'formulaRef', name: 'ant' },
            { type: 'verseMarker', marker: 'v.', text: 'Venite exsultemus Domino' },
            { type: 'formulaRef', name: 'ant2' }
          ],
          startLine: 1,
          endLine: 3
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Special/Matutinum Special.txt',
      sections: [
        {
          header: 'Invit',
          content: [
            {
              type: 'conditional',
              condition: {
                expression: {
                  type: 'not',
                  inner: { type: 'match', subject: 'rubrica', predicate: 'praedicatorum' }
                }
              },
              content: [{ type: 'text', value: 'Feria II = Venite, * Exsultemus Domino.' }],
              scope: { backwardLines: 0, forwardMode: 'line' }
            }
          ],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Invitatorium',
        section: '__preamble',
        selector: 'Nativitatis'
      },
      { languages: ['Latin'], dayOfWeek: 1 }
    );

    expect(resolved.Latin?.content[0]).toMatchObject({
      type: 'conditional',
      condition: {
        expression: {
          type: 'not',
          inner: { type: 'match', subject: 'rubrica', predicate: 'praedicatorum' }
        }
      }
    });
    expect(
      (resolved.Latin?.content[0] as { content?: readonly { type: string; marker?: string; text?: string }[] })
        .content?.[0]
    ).toEqual({
      type: 'verseMarker',
      marker: 'Ant.',
      text: 'Venite, * Exsultemus Domino.'
    });
    expect(
      (resolved.Latin?.content[2] as { content?: readonly { type: string; marker?: string; text?: string }[] })
        .content?.[0]
    ).toEqual({
      type: 'verseMarker',
      marker: 'Ant.',
      text: 'Exsultemus Domino.'
    });
    expect(collectTexts(resolved.Latin?.content ?? []).join('|')).toContain(
      'Venite, * Exsultemus Domino.'
    );
  });

  it('uses the ordinary Sunday Invit 1 fallback before April', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Invitatorium.txt',
      sections: [
        {
          header: '__preamble',
          content: [{ type: 'formulaRef', name: 'ant' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Special/Matutinum Special.txt',
      sections: [
        {
          header: 'Invit',
          content: [
            { type: 'text', value: 'Dominica = Dóminum, qui fecit nos, * Veníte, adorémus.' },
            { type: 'text', value: 'Invit 1 = Adorémus Dóminum, * Quóniam ipse fecit nos.' }
          ],
          startLine: 1,
          endLine: 2
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Invitatorium',
        section: '__preamble',
        selector: 'Epiphania'
      },
      {
        languages: ['Latin'],
        dayOfWeek: 0,
        date: { year: 2024, month: 1, day: 14 }
      }
    );

    expect(resolved.Latin?.content).toEqual([
      {
        type: 'verseMarker',
        marker: 'Ant.',
        text: 'Adorémus Dóminum, * Quóniam ipse fecit nos.'
      }
    ]);
  });

  it('renders ant2 as only the post-asterisk invitatory refrain', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Invitatorium.txt',
      sections: [
        {
          header: '__preamble',
          content: [{ type: 'formulaRef', name: 'ant2' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });
    index.addFile({
      path: 'horas/Latin/Psalterium/Special/Matutinum Special.txt',
      sections: [
        {
          header: 'Invit Pasch',
          content: [{ type: 'text', value: 'Christus natus est nobis: * Veníte, adorémus.' }],
          startLine: 1,
          endLine: 1
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Invitatorium',
        section: '__preamble',
        selector: 'Pascha'
      },
      { languages: ['Latin'], dayOfWeek: 0 }
    );

    expect(resolved.Latin?.content).toEqual([
      { type: 'verseMarker', marker: 'Ant.', text: 'Veníte, adorémus.' }
    ]);
  });

  it('applies integer selectors inside conditional-only sections while preserving branch conditions', () => {
    const index = new InMemoryTextIndex();
    index.addFile({
      path: 'horas/Latin/Psalterium/Benedictions.txt',
      sections: [
        {
          header: 'Nocturn 2',
          content: [
            {
              type: 'conditional',
              condition: {
                expression: {
                  type: 'not',
                  inner: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
                }
              },
              content: [
                { type: 'text', value: 'Roman line 1' },
                { type: 'text', value: 'Roman line 2' },
                { type: 'text', value: 'Roman line 3' }
              ],
              scope: { backwardLines: 0, forwardMode: 'line' }
            },
            {
              type: 'conditional',
              condition: {
                expression: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' }
              },
              content: [
                { type: 'text', value: 'Cistercian line 1' },
                { type: 'text', value: 'Cistercian line 2' },
                { type: 'text', value: 'Cistercian line 3' }
              ],
              scope: { backwardLines: 0, forwardMode: 'line' }
            }
          ],
          startLine: 1,
          endLine: 6
        }
      ]
    });

    const resolved = resolveReference(
      index,
      {
        path: 'horas/Latin/Psalterium/Benedictions',
        section: 'Nocturn 2',
        selector: '2'
      },
      { languages: ['Latin'] }
    );

    expect(resolved.Latin?.content).toHaveLength(2);
    expect(resolved.Latin?.content[0]).toMatchObject({
      type: 'conditional',
      content: [{ type: 'text', value: 'Roman line 2' }]
    });
    expect(resolved.Latin?.content[1]).toMatchObject({
      type: 'conditional',
      content: [{ type: 'text', value: 'Cistercian line 2' }]
    });
  });
});

function collectTexts(content: readonly import('@officium-novum/parser').TextContent[]): string[] {
  const out: string[] = [];

  for (const node of content) {
    if (node.type === 'text') {
      out.push(node.value);
      continue;
    }
    if (node.type === 'verseMarker') {
      out.push(node.text);
      continue;
    }
    if (node.type === 'conditional') {
      out.push(...collectTexts(node.content));
    }
  }

  return out;
}
