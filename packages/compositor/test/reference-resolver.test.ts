import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';

import { resolveReference, swapLanguageSegment } from '../src/resolve/reference-resolver.js';

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
      .filter((node) => node.type === 'text')
      .map((node) => node.value)
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

    const rendered = (resolved.Latin?.content ?? [])
      .filter((node) => node.type === 'text')
      .map((node) => node.value)
      .join('|');

    expect(rendered).toContain('Monday antiphon');
    expect(rendered).toContain('23:1 Domini est terra');
    expect(rendered).toContain('24:1 Ad te Domine levavi');
    expect(rendered).not.toContain('Sunday antiphon');
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
});
