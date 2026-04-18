import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  HourStructure,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';

function makeFile(path: string, header: string, nodes: ParsedFile['sections'][number]['content']): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: [{ header, content: nodes, startLine: 1, endLine: 1 }]
  };
}

function makeFileMulti(
  path: string,
  sections: readonly { header: string; content: ParsedFile['sections'][number]['content'] }[]
): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: sections.map((section) => ({
      header: section.header,
      content: section.content,
      startLine: 1,
      endLine: 1
    }))
  };
}

const stubVersion: ResolvedVersion = {
  handle: 'Rubrics 1960' as never,
  kalendar: 'General-1960',
  transfer: 'General-1960',
  stransfer: 'General-1960',
  policy: {} as never
};

function buildSummary(hour: HourStructure): DayOfficeSummary {
  return {
    date: '2024-04-14',
    version: {
      handle: stubVersion.handle,
      kalendar: stubVersion.kalendar,
      transfer: stubVersion.transfer,
      stransfer: stubVersion.stransfer,
      policyName: 'rubrics-1960'
    },
    temporal: {
      date: '2024-04-14',
      dayOfWeek: 0,
      weekStem: 'Pasc',
      dayName: 'Dominica in Albis',
      season: 'eastertide',
      feastRef: { path: 'horas/Latin/Tempora/Pasc1-0', sectionRef: undefined } as never,
      rank: {} as never
    },
    warnings: [],
    celebration: { feastRef: { title: 'Dominica in Albis' } } as never,
    celebrationRules: {} as never,
    commemorations: [],
    concurrence: {} as never,
    compline: {} as never,
    hours: { [hour.hour]: hour },
    candidates: [],
    winner: {} as never
  };
}

function renderRuns(
  line: { texts: Readonly<Record<string, readonly { type: string }[]>> },
  language: string
): string {
  const runs = line.texts[language] ?? [];
  return runs
    .map((run) => {
      switch (run.type) {
        case 'text':
        case 'rubric':
        case 'citation':
          return (run as { value: string }).value;
        case 'unresolved-macro':
          return `&${(run as { name: string }).name}`;
        case 'unresolved-formula':
          return `$${(run as { name: string }).name}`;
        case 'unresolved-reference':
          return '@';
        default:
          return '';
      }
    })
    .join('');
}

describe('composeHour', () => {
  it('resolves a single-ref slot and emits a Section with per-language lines', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Te lucis ante terminum' }
      ])
    );
    corpus.addFile(
      makeFile('horas/English/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Before the ending of the day' }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' }
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['Latin', 'English'] }
    });

    expect(composed.hour).toBe('compline');
    expect(composed.sections).toHaveLength(1);

    const hymn = composed.sections[0]!;
    expect(hymn.type).toBe('hymn');
    expect(hymn.slot).toBe('hymn');
    expect(hymn.reference).toBe('horas/Latin/Commune/C4v#Hymnus');
    expect(hymn.lines).toHaveLength(1);
    expect(renderRuns(hymn.lines[0]!, 'Latin')).toBe('Te lucis ante terminum');
    expect(renderRuns(hymn.lines[0]!, 'English')).toBe('Before the ending of the day');
  });

  it('applies conditional flattening when resolving content', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalms/Psalm1', 'Psalmus 1', [
        { type: 'text', value: 'Beatus vir' },
        {
          type: 'conditional',
          condition: {
            expression: { type: 'match', subject: 'tempore', predicate: 'Paschali' }
          },
          content: [{ type: 'text', value: ', alleluia' }]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        chapter: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Psalms/Psalm1', section: 'Psalmus 1' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Beatus vir, alleluia');
  });

  it('expands formulaRef and macroRef from Common/Prayers', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'formulaRef', name: 'Oremus' },
        { type: 'separator' },
        { type: 'macroRef', name: 'Benedicamus_Domino' }
      ])
    );
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Common/Prayers', [
        {
          header: 'Oremus',
          content: [{ type: 'verseMarker', marker: 'v.', text: 'Orémus.' }]
        },
        {
          header: 'Benedicamus Domino',
          content: [
            { type: 'verseMarker', marker: 'V.', text: 'Benedicámus Dómino.' },
            { type: 'verseMarker', marker: 'R.', text: 'Deo grátias.' }
          ]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Orémus.');
    expect(renderRuns(composed.sections[0]!.lines[1]!, 'Latin')).toBe('Benedicámus Dómino.');
    expect(renderRuns(composed.sections[0]!.lines[2]!, 'Latin')).toBe('Deo grátias.');
  });

  it('expands psalmInclude from the Psalterium', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [{ type: 'psalmInclude', psalmNumber: 1 }])
    );
    // Real upstream layout: psalms live under `Psalterium/Psalmorum/`, the
    // files carry no `[Header]`, so the parser creates a `__preamble` section.
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm1', '__preamble', [
        { type: 'text', value: 'Beátus vir' }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Beátus vir');
  });

  it('uses the parser fallback chain for deferred nodes on a resolved corpus', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/English/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Before the ending of the day' },
        { type: 'separator' },
        { type: 'formulaRef', name: 'Deo gratias' }
      ])
    );
    corpus.addFile(
      makeFile('horas/English/Psalterium/Common/Prayers', 'Deo gratias', [
        { type: 'verseMarker', marker: 'R.', text: 'Thanks be to God.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' }
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['English-UK'] }
    });

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'English-UK')).toBe(
      'Before the ending of the day'
    );
    expect(renderRuns(composed.sections[0]!.lines[1]!, 'English-UK')).toBe('Thanks be to God.');
  });

  it('surfaces residual reference nodes instead of dropping them', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Alpha ' },
        {
          type: 'reference',
          ref: {
            path: 'Commune/C5',
            section: 'Beta',
            substitutions: [],
            isPreamble: false
          }
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Alpha @');
    expect(
      composed.sections[0]!.lines[0]!.texts.Latin?.some((run) => run.type === 'unresolved-reference')
    ).toBe(true);
  });
});
