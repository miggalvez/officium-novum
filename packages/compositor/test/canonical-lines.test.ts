import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile, TextContent } from '@officium-novum/parser';
import type { DayOfficeSummary, HourStructure, ResolvedVersion } from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { markAntiphonFirstText, isWholeAntiphonSlot } from '../src/emit/antiphon-marker.js';

const stubVersion: ResolvedVersion = {
  handle: 'Rubrics 1960 - 1960' as never,
  kalendar: 'General-1960',
  transfer: 'General-1960',
  stransfer: 'General-1960',
  policy: {} as never
};

function buildSummary(hour: HourStructure): DayOfficeSummary {
  return {
    date: '2024-01-01',
    version: {
      handle: stubVersion.handle,
      kalendar: stubVersion.kalendar,
      transfer: stubVersion.transfer,
      stransfer: stubVersion.stransfer,
      policyName: 'rubrics-1960'
    },
    temporal: {
      date: '2024-01-01',
      dayOfWeek: 1,
      weekStem: 'Nat',
      dayName: 'In Octava Nativitatis',
      season: 'christmastide',
      feastRef: { path: 'horas/Latin/Sancti/01-01', sectionRef: undefined } as never,
      rank: {} as never
    },
    warnings: [],
    celebration: { feastRef: { title: 'In Octava Nativitatis' } } as never,
    celebrationRules: {} as never,
    commemorations: [],
    concurrence: {} as never,
    compline: {} as never,
    hours: { [hour.hour]: hour },
    candidates: [],
    winner: {} as never
  };
}

function firstLineMarker(composed: { sections: readonly { slot: string; lines: readonly { marker?: string }[] }[] }, slot: string): string | undefined {
  const section = composed.sections.find((s) => s.slot === slot);
  return section?.lines[0]?.marker;
}

function lineMarkers(
  composed: { sections: readonly { slot: string; lines: readonly { marker?: string }[] }[] },
  slot: string
): readonly (string | undefined)[] {
  const section = composed.sections.find((s) => s.slot === slot);
  return section?.lines.map((l) => l.marker) ?? [];
}

function lineTexts(
  composed: { sections: readonly { slot: string; lines: readonly { texts: Record<string, ReadonlyArray<{ type: string; value?: string }>> }[] }[] },
  slot: string,
  language: string
): readonly string[] {
  const section = composed.sections.find((s) => s.slot === slot);
  if (!section) return [];
  return section.lines.map((line) => {
    const runs = line.texts[language] ?? [];
    return runs
      .map((run) => ('value' in run && typeof run.value === 'string' ? run.value : ''))
      .join('');
  });
}

// ---------------------------------------------------------------------------
// Unit tests for the helpers in emit/antiphon-marker.ts
// ---------------------------------------------------------------------------

describe('antiphon-marker helpers', () => {
  it('classifies the whole-antiphon slots', () => {
    expect(isWholeAntiphonSlot('invitatory')).toBe(true);
    expect(isWholeAntiphonSlot('antiphon-ad-benedictus')).toBe(true);
    expect(isWholeAntiphonSlot('antiphon-ad-magnificat')).toBe(true);
    expect(isWholeAntiphonSlot('antiphon-ad-nunc-dimittis')).toBe(true);
    expect(isWholeAntiphonSlot('commemoration-antiphons')).toBe(true);
    expect(isWholeAntiphonSlot('hymn')).toBe(false);
    expect(isWholeAntiphonSlot('psalmody')).toBe(false);
    expect(isWholeAntiphonSlot('oration')).toBe(false);
  });

  it('wraps the first text node as an Ant. verseMarker', () => {
    const input: readonly TextContent[] = [{ type: 'text', value: 'O admirábile commércium...' }];
    expect(markAntiphonFirstText(input)).toEqual([
      { type: 'verseMarker', marker: 'Ant.', text: 'O admirábile commércium...' }
    ]);
  });

  it('wraps only the first text node, leaving later text nodes alone', () => {
    const input: readonly TextContent[] = [
      { type: 'text', value: 'First' },
      { type: 'text', value: 'Second' }
    ];
    expect(markAntiphonFirstText(input)).toEqual([
      { type: 'verseMarker', marker: 'Ant.', text: 'First' },
      { type: 'text', value: 'Second' }
    ]);
  });

  it('leaves leading non-text nodes alone and wraps the first downstream text node', () => {
    const input: readonly TextContent[] = [
      { type: 'rubric', value: '(somewhere)' },
      { type: 'text', value: 'Kyrie eleison' }
    ];
    expect(markAntiphonFirstText(input)).toEqual([
      { type: 'rubric', value: '(somewhere)' },
      { type: 'verseMarker', marker: 'Ant.', text: 'Kyrie eleison' }
    ]);
  });

  it('returns the input unchanged when there is no text node to wrap', () => {
    const input: readonly TextContent[] = [{ type: 'rubric', value: '(rubric only)' }];
    expect(markAntiphonFirstText(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: Ant. prefix surfaces on whole-antiphon slots and on
// psalmody antiphon refs; hymn slots surface `_` for stanza separators.
// ---------------------------------------------------------------------------

function buildCorpus(): InMemoryTextIndex {
  const corpus = new InMemoryTextIndex();

  const antLaudes: ParsedFile = {
    path: 'horas/Latin/Sancti/01-01.txt',
    sections: [
      {
        header: 'Ant Benedictus',
        startLine: 1,
        endLine: 1,
        content: [{ type: 'text', value: 'O admirábile commércium...' }]
      },
      {
        header: 'Ant Magnificat',
        startLine: 2,
        endLine: 2,
        content: [{ type: 'text', value: 'Magnum hereditátis mystérium...' }]
      },
      {
        header: 'Ant Nunc dimittis',
        startLine: 3,
        endLine: 3,
        content: [{ type: 'text', value: 'Alma Redemptóris Mater...' }]
      }
    ]
  };
  corpus.addFile(antLaudes);

  const hymnFile: ParsedFile = {
    path: 'horas/Latin/Psalterium/Special/Prima Special.txt',
    sections: [
      {
        header: 'Hymnus Prima',
        startLine: 1,
        endLine: 20,
        content: [
          { type: 'verseMarker', marker: 'v.', text: 'Jam lucis orto sídere,' },
          { type: 'text', value: 'Deum precémur súpplices,' },
          { type: 'text', value: 'Ut in diúrnis áctibus' },
          { type: 'text', value: 'Nos servet a nocéntibus.' },
          { type: 'separator' },
          { type: 'text', value: 'Linguam refrénans témperet,' },
          { type: 'text', value: 'Ne litis horror ínsonet:' },
          { type: 'text', value: 'Visum fovéndo cóntegat,' },
          { type: 'text', value: 'Ne vanitátes háuriat.' }
        ]
      }
    ]
  };
  corpus.addFile(hymnFile);

  return corpus;
}

function buildHour(slot: string, ref: { path: string; section: string }, hourName: HourStructure['hour']): HourStructure {
  return {
    hour: hourName,
    slots: { [slot]: { kind: 'single-ref', ref } },
    directives: []
  } as HourStructure;
}

describe('Ant. marker emission', () => {
  it('prefixes the Benedictus antiphon with marker "Ant." at Lauds', () => {
    const corpus = buildCorpus();
    const hour = buildHour(
      'antiphon-ad-benedictus',
      { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant Benedictus' },
      'lauds'
    );
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });
    expect(firstLineMarker(composed, 'antiphon-ad-benedictus')).toBe('Ant.');
    expect(lineTexts(composed, 'antiphon-ad-benedictus', 'Latin')).toEqual([
      'O admirábile commércium...'
    ]);
  });

  it('prefixes the Magnificat antiphon at Vespers', () => {
    const corpus = buildCorpus();
    const hour = buildHour(
      'antiphon-ad-magnificat',
      { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant Magnificat' },
      'vespers'
    );
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'vespers',
      options: { languages: ['Latin'] }
    });
    expect(firstLineMarker(composed, 'antiphon-ad-magnificat')).toBe('Ant.');
  });

  it('prefixes the Nunc dimittis antiphon at Compline', () => {
    const corpus = buildCorpus();
    const hour = buildHour(
      'antiphon-ad-nunc-dimittis',
      { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant Nunc dimittis' },
      'compline'
    );
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['Latin'] }
    });
    expect(firstLineMarker(composed, 'antiphon-ad-nunc-dimittis')).toBe('Ant.');
  });

  it('prefixes psalmody antiphon refs with "Ant." while leaving psalm verses unmarked', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Sancti/01-01.txt',
      sections: [
        {
          header: 'Ant 1',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'O admirábile commércium, psalm antiphon' }]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Dóminus regnávit, decórem índuit...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              antiphonRef: { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant 1' },
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
                section: '__preamble'
              }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const markers = lineMarkers(composed, 'psalmody');
    // First rendered line is the antiphon with "Ant." marker; the psalm verse
    // that follows has no marker.
    expect(markers[0]).toBe('Ant.');
    expect(markers[1]).toBeUndefined();
  });

  it('applies Paschaltide add-alleluia to bare psalmody antiphon refs before marker synthesis', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Sancti/01-01.txt',
      sections: [
        {
          header: 'Ant 1',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'O admirábile commércium, psalm antiphon' }]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Dóminus regnávit, decórem índuit...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              antiphonRef: { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant 1' },
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
                section: '__preamble'
              }
            }
          ]
        }
      },
      directives: ['add-alleluia']
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const markers = lineMarkers(composed, 'psalmody');
    const texts = lineTexts(composed, 'psalmody', 'Latin');
    const antiphonTexts = texts.filter((_, index) => markers[index] === 'Ant.');

    expect(antiphonTexts).toContain('O admirábile commércium, psalm antiphon, allelúja.');
  });

  it('keeps inline rubrics on the same rendered line instead of splitting them into separate lines', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Common/Prayers.txt',
      sections: [
        {
          header: 'Confiteor',
          startLine: 1,
          endLine: 1,
          content: [
            {
              type: 'verseMarker',
              marker: 'v.',
              text: 'Confíteor Deo omnipoténti, quia peccávi nimis, cogitatióne, verbo et ópere:'
            },
            { type: 'rubric', value: 'percutit sibi pectus' },
            { type: 'text', value: 'mea culpa, mea culpa, mea máxima culpa.' }
          ]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        'lectio-brevis': {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Common/Prayers', section: 'Confiteor' }
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['Latin'] }
    });

    expect(lineTexts(composed, 'lectio-brevis', 'Latin')).toEqual([
      'Confíteor Deo omnipoténti, quia peccávi nimis, cogitatióne, verbo et ópere: percutit sibi pectus mea culpa, mea culpa, mea máxima culpa.'
    ]);
  });

  it('prefixes psalmRef-inline antiphons (Vespers/Matins style) with "Ant."', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Sancti/01-01.txt',
      sections: [
        {
          header: 'Ant Vespera',
          startLine: 1,
          endLine: 1,
          content: [
            {
              type: 'psalmRef',
              psalmNumber: 109,
              antiphon: 'O admirábile commércium (Vespera)'
            }
          ]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm109.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Dixit Dóminus Dómino meo...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'vespers',
      slots: {
        antiphon_vespers: undefined,
        antiphon_ad_magnificat: undefined,
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Sancti/01-01.txt', section: 'Ant Vespera' }
        }
      } as HourStructure['slots'],
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'vespers',
      options: { languages: ['Latin'] }
    });

    const markers = lineMarkers(composed, 'incipit');
    // The psalmRef's inline antiphon expands to a verseMarker with marker
    // "Ant.", so the first line of the incipit section (which wraps the
    // psalmRef in this test fixture) carries that marker.
    expect(markers[0]).toBe('Ant.');
  });
});

describe('hymn stanza separator emission', () => {
  it('emits a literal "_" line between stanzas of a hymn slot', () => {
    const corpus = buildCorpus();
    const hour = buildHour(
      'hymn',
      { path: 'horas/Latin/Psalterium/Special/Prima Special.txt', section: 'Hymnus Prima' },
      'prime'
    );
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });
    const texts = lineTexts(composed, 'hymn', 'Latin');
    // Expect the first stanza (4 lines) + the separator "_" + the second
    // stanza (4 lines) = 9 rendered lines.
    expect(texts).toEqual([
      'Jam lucis orto sídere,',
      'Deum precémur súpplices,',
      'Ut in diúrnis áctibus',
      'Nos servet a nocéntibus.',
      '_',
      'Linguam refrénans témperet,',
      'Ne litis horror ínsonet:',
      'Visum fovéndo cóntegat,',
      'Ne vanitátes háuriat.'
    ]);
  });

  it('does not emit "_" lines for separators in non-hymn slots', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Test.txt',
      sections: [
        {
          header: 'Versicle',
          startLine: 1,
          endLine: 3,
          content: [
            { type: 'verseMarker', marker: 'V.', text: 'First line' },
            { type: 'separator' },
            { type: 'verseMarker', marker: 'R.', text: 'Second line' }
          ]
        }
      ]
    });
    const hour = buildHour(
      'versicle',
      { path: 'horas/Latin/Test.txt', section: 'Versicle' },
      'lauds'
    );
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });
    const texts = lineTexts(composed, 'versicle', 'Latin');
    // No "_" appears — separator is treated as a plain line break here.
    expect(texts).toEqual(['First line', 'Second line']);
  });

  it('renders trailing text on gabc hymn header lines instead of dropping the opening line', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Special/Matutinum Special.txt',
      sections: [
        {
          header: 'Day0 Hymnus1',
          startLine: 1,
          endLine: 2,
          content: [
            {
              type: 'gabcNotation',
              notation: {
                kind: 'header',
                notation: '{:H-MatDom4:}',
                text: 'v. Primo die, quo Trínitas'
              }
            },
            { type: 'text', value: 'Beáta mundum cóndidit,' }
          ]
        }
      ]
    });

    const hour = buildHour(
      'hymn',
      {
        path: 'horas/Latin/Psalterium/Special/Matutinum Special',
        section: 'Day0 Hymnus1'
      },
      'matins'
    );

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    expect(lineTexts(composed, 'hymn', 'Latin')).toEqual([
      'Primo die, quo Trínitas',
      'Beáta mundum cóndidit,'
    ]);
  });
});

describe('Psalmus N [index] heading emission', () => {
  it('emits a `Psalmus N [M]` heading before each psalm in the psalmody slot', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Dóminus regnávit, decórem índuit...' }]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm99.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Jubiláte Deo, omnis terra...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            { psalmRef: { path: 'horas/Latin/Psalterium/Psalmorum/Psalm92', section: '__preamble' } },
            { psalmRef: { path: 'horas/Latin/Psalterium/Psalmorum/Psalm99', section: '__preamble' } }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const texts = lineTexts(composed, 'psalmody', 'Latin');
    expect(texts[0]).toBe('Psalmus 92 [1]');
    expect(texts[1]).toBe('Dóminus regnávit, decórem índuit...');
    expect(texts[2]).toBe('Psalmus 99 [2]');
    expect(texts[3]).toBe('Jubiláte Deo, omnis terra...');
  });

  it('includes a verse-range suffix when the psalm reference carries a range selector', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm118.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Beáti immaculáti in via...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm118',
                section: '__preamble',
                selector: '1-16'
              }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });

    const texts = lineTexts(composed, 'psalmody', 'Latin');
    expect(texts[0]).toBe('Psalmus 118(1-16) [1]');
  });

  it('uses Old Testament canticle titles as headings after leading separators and preserves the citation', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm223.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 2,
          content: [
            { type: 'separator' },
            { type: 'text', value: '' },
            { type: 'text', value: '(Canticum Annæ * 3 Reg 2:1-16)' },
            {
              type: 'text',
              value: '2:1 Exsultávit cor meum in Dómino, * et exaltátum est cornu meum in Deo meo.'
            }
          ]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            { psalmRef: { path: 'horas/Latin/Psalterium/Psalmorum/Psalm223', section: '__preamble' } }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    expect(lineTexts(composed, 'psalmody', 'Latin')).toEqual([
      'Canticum Annæ [1]',
      '3 Reg 2:1-16',
      '2:1 Exsultávit cor meum in Dómino, * et exaltátum est cornu meum in Deo meo.'
    ]);
  });

  it('emits the heading after the antiphon when the assignment pairs both', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Sancti/01-01.txt',
      sections: [
        {
          header: 'Ant Laudes',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'O admirábile commércium' }]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Dóminus regnávit...' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              antiphonRef: { path: 'horas/Latin/Sancti/01-01', section: 'Ant Laudes' },
              psalmRef: { path: 'horas/Latin/Psalterium/Psalmorum/Psalm92', section: '__preamble' }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const texts = lineTexts(composed, 'psalmody', 'Latin');
    // Sequence: antiphon line (with Ant. marker), then the psalm heading,
    // then the psalm body.
    expect(texts[0]).toBe('O admirábile commércium');
    expect(texts[1]).toBe('Psalmus 92 [1]');
    expect(texts[2]).toBe('Dóminus regnávit...');
  });

  it('expands wrapped psalmody sections one inner psalm at a time without duplicating the first antiphon', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Sancti/01-01.txt',
      sections: [
        {
          header: 'Ant Vespera',
          startLine: 1,
          endLine: 1,
          content: [
            {
              type: 'psalmRef',
              psalmNumber: 109,
              antiphon: 'O admirábile commércium'
            }
          ]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi major.txt',
      sections: [
        {
          header: 'Day0 Vespera',
          startLine: 1,
          endLine: 2,
          content: [
            {
              type: 'psalmRef',
              psalmNumber: 109,
              antiphon: 'Dixit Dóminus * Dómino meo: Sede a dextris meis.'
            },
            {
              type: 'psalmRef',
              psalmNumber: 110,
              antiphon: 'Magna ópera Dómini * exquisíta in omnes voluntátes ejus.'
            }
          ]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm109.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 2,
          content: [
            { type: 'text', value: '109:1a Dixit Dóminus Dómino meo: * Sede a dextris meis:' },
            { type: 'text', value: '109:1b Donec ponam inimícos tuos.' }
          ]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm110.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 2,
          content: [
            { type: 'text', value: '110:1 Confitébor tibi, Dómine, in toto corde meo.' },
            { type: 'text', value: '110:2 Magna ópera Dómini.' }
          ]
        }
      ]
    });
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Common/Prayers.txt',
      sections: [
        {
          header: 'Gloria',
          startLine: 1,
          endLine: 2,
          content: [
            { type: 'verseMarker', marker: 'V.', text: 'Glória Patri, et Fílio, * et Spirítui Sancto.' },
            {
              type: 'verseMarker',
              marker: 'R.',
              text: 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'
            }
          ]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'vespers',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              antiphonRef: { path: 'horas/Latin/Sancti/01-01', section: 'Ant Vespera' },
              psalmRef: { path: 'horas/Latin/Psalterium/Psalmi/Psalmi major', section: 'Day0 Vespera' }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'vespers',
      options: { languages: ['Latin'] }
    });

    const texts = lineTexts(composed, 'psalmody', 'Latin');
    expect(texts.slice(0, 10)).toEqual([
      'O admirábile commércium',
      'Psalmus 109 [1]',
      '109:1 Dixit Dóminus Dómino meo: * Sede a dextris meis:',
      '109:1 Donec ponam inimícos tuos.',
      'Glória Patri, et Fílio, * et Spirítui Sancto.',
      'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
      'Magna ópera Dómini * exquisíta in omnes voluntátes ejus.',
      'Psalmus 110 [2]',
      '110:1 Confitébor tibi, Dómine, in toto corde meo.',
      '110:2 Magna ópera Dómini.'
    ]);
  });

  it('removes numeric carry-over markers like (4a), (5), and (8) from psalmody lines', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm92.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 2,
          content: [
            { type: 'text', value: '92:3a Elevavérunt flúmina fluctus suos,' },
            { type: 'separator' },
            { type: 'text', value: '92:3b Elevavérunt flúmina fluctus suos, * (4a) a vócibus aquárum multárum.' },
            { type: 'separator' },
            { type: 'text', value: '92:4 Mirábiles elatiónes maris, * (7) mirábilis in altis Dóminus.' },
            { type: 'separator' },
            { type: 'text', value: '92:5 Parátum cor ejus speráre in Dómino, (8) confirmátum est cor ejus: * non commovébitur.' },
            { type: 'separator' },
            { type: 'text', value: '92:6 Laudáte nomen ejus: (5) quóniam suávis est Dóminus, † in ætérnum misericórdia ejus, * et usque in finem.' }
          ]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm92',
                section: '__preamble'
              }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    expect(lineTexts(composed, 'psalmody', 'Latin')).toEqual([
      'Psalmus 92 [1]',
      '92:3 Elevavérunt flúmina fluctus suos,',
      '92:3 Elevavérunt flúmina fluctus suos, * a vócibus aquárum multárum.',
      '92:4 Mirábiles elatiónes maris, * mirábilis in altis Dóminus.',
      '92:5 Parátum cor ejus speráre in Dómino, confirmátum est cor ejus: * non commovébitur.',
      '92:6 Laudáte nomen ejus: quóniam suávis est Dóminus, in ætérnum misericórdia ejus, * et usque in finem.'
    ]);
  });

  it('removes dagger half-verse markers from psalmody lines', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Psalterium/Psalmorum/Psalm1.txt',
      sections: [
        {
          header: '__preamble',
          startLine: 1,
          endLine: 1,
          content: [
            {
              type: 'text',
              value:
                '1:1 Beátus vir, qui non ábiit in consílio impiórum, † et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:'
            }
          ]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm1',
                section: '__preamble'
              }
            }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    expect(lineTexts(composed, 'psalmody', 'Latin')).toEqual([
      'Psalmus 1 [1]',
      '1:1 Beátus vir, qui non ábiit in consílio impiórum, et in via peccatórum non stetit, * et in cáthedra pestiléntiæ non sedit:'
    ]);
  });

  it('does not emit a psalm heading when the reference path does not match the Psalmorum shape', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Latin/Commune/SomethingElse.txt',
      sections: [
        {
          header: 'Hymnus',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'text', value: 'Non-psalm content' }]
        }
      ]
    });

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            { psalmRef: { path: 'horas/Latin/Commune/SomethingElse', section: 'Hymnus' } }
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const texts = lineTexts(composed, 'psalmody', 'Latin');
    // No heading; just the resolved content.
    expect(texts).toEqual(['Non-psalm content']);
  });
});
