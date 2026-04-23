import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  HourStructure,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { normalizeRepeatedAntiphonText } from '../src/compose/psalmody.js';

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

function buildSummary(
  hour: HourStructure,
  options: {
    version?: ResolvedVersion;
    season?: DayOfficeSummary['temporal']['season'];
    dayName?: string;
    date?: string;
  } = {}
): DayOfficeSummary {
  const version = options.version ?? stubVersion;
  const season = options.season ?? 'eastertide';
  const dayName = options.dayName ?? 'Dominica in Albis';
  const date = options.date ?? '2024-04-14';
  return {
    date,
    version: {
      handle: version.handle,
      kalendar: version.kalendar,
      transfer: version.transfer,
      stransfer: version.stransfer,
      policyName: 'rubrics-1960'
    },
    temporal: {
      date: '2024-04-14',
      dayOfWeek: 0,
      weekStem: 'Pasc',
      dayName,
      season,
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

function slotLines(
  composed: ReturnType<typeof composeHour>,
  slot: 'psalmody' | 'hymn',
  language: string
): readonly string[] {
  const section = composed.sections.find((candidate) => candidate.slot === slot);
  return section?.lines.map((line) => renderRuns(line, language)) ?? [];
}

describe('composeHour', () => {
  it('strips source selector comments while normalizing repeated psalmody antiphons', () => {
    expect(normalizeRepeatedAntiphonText('Allelúja, * allelúja, allelúja;;53,117')).toBe(
      'Allelúja, allelúja, allelúja'
    );
  });

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

  it('resolves an incipit slot from an Ordinarium __preamble heading block', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile({
      path: 'horas/Ordinarium/Prima.txt',
      sections: [
        {
          header: '__preamble',
          content: [
            { type: 'heading', value: 'Incipit' },
            { type: 'formulaRef', name: 'Deus in adjutorium' },
            { type: 'separator' },
            { type: 'macroRef', name: 'Alleluia' },
            { type: 'heading', value: 'Conclusio' },
            { type: 'formulaRef', name: 'Benedicamus Domino' }
          ],
          startLine: 1,
          endLine: 6
        }
      ]
    });
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Common/Prayers', [
        {
          header: 'Deus in adjutorium',
          content: [{ type: 'verseMarker', marker: 'V.', text: 'Deus, in adjutórium meum inténde.' }]
        },
        {
          header: 'Alleluia',
          content: [{ type: 'text', value: 'Allelúja.' }]
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
      hour: 'prime',
      slots: {
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Ordinarium/Prima', section: 'Incipit' }
        },
        conclusion: {
          kind: 'single-ref',
          ref: { path: 'horas/Ordinarium/Prima', section: 'Conclusio' }
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

    expect(composed.sections.map((section) => section.slot)).toEqual(['incipit', 'conclusion']);
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Deus, in adjutórium meum inténde.'
    );
    expect(renderRuns(composed.sections[0]!.lines[1]!, 'Latin')).toBe('Allelúja.');
    expect(renderRuns(composed.sections[1]!.lines[0]!, 'Latin')).toBe('Benedicámus Dómino.');
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

  it('injects Sunday Compline preces from the special corpus section when the slot is empty', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Preces', 'Preces dominicales Completorium', [
        { type: 'verseMarker', marker: 'V.', text: 'Benedíctus es, Dómine, Deus patrum nostrórum.' },
        { type: 'verseMarker', marker: 'R.', text: 'Et laudábilis et gloriósus in sǽcula.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        preces: { kind: 'empty' }
      },
      directives: ['preces-dominicales']
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(1);
    expect(composed.sections[0]!.slot).toBe('preces');
    expect(composed.sections[0]!.reference).toBe(
      'horas/Latin/Psalterium/Special/Preces#Preces dominicales Completorium'
    );
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Benedíctus es, Dómine, Deus patrum nostrórum.'
    );
  });

  it('injects ferial Lauds preces from the special corpus section when the slot is empty', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Preces', 'Preces feriales Laudes', [
        { type: 'verseMarker', marker: 'V.', text: 'Ego dixi: Dómine, miserére mei.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sana ánimam meam quia peccávi tibi.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        preces: { kind: 'empty' }
      },
      directives: ['preces-feriales']
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(1);
    expect(composed.sections[0]!.slot).toBe('preces');
    expect(composed.sections[0]!.reference).toBe(
      'horas/Latin/Psalterium/Special/Preces#Preces feriales Laudes'
    );
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Ego dixi: Dómine, miserére mei.'
    );
  });

  it('injects pre-1955 suffragium from Major Special when the slot is empty', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Major Special', 'Suffragium', [
        { type: 'text', value: 'Ant. Beáta Dei Génitrix Virgo María.' },
        { type: 'separator' },
        { type: 'verseMarker', marker: 'V.', text: 'Mirificávit Dóminus Sanctos suos.' },
        { type: 'verseMarker', marker: 'R.', text: 'Et exaudívit eos clamántes ad se.' }
      ])
    );

    const divinoAfflatuVersion: ResolvedVersion = {
      ...stubVersion,
      handle: 'Divino Afflatu - 1954' as never
    };
    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        suffragium: { kind: 'empty' }
      },
      directives: ['suffragium-of-the-saints']
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        version: divinoAfflatuVersion,
        season: 'time-after-pentecost',
        dayName: 'Pent03-0'
      }),
      version: divinoAfflatuVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(1);
    expect(composed.sections[0]!.slot).toBe('suffragium');
    expect(composed.sections[0]!.reference).toBe(
      'horas/Latin/Psalterium/Special/Major Special#Suffragium'
    );
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Ant. Beáta Dei Génitrix Virgo María.'
    );
  });

  it('uses the Paschaltide suffragium variant during Eastertide', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Major Special', 'Suffragium Paschale', [
        { type: 'text', value: 'Ant. Crucifíxus surréxit a mórtuis, allelúja.' }
      ])
    );

    const reduced1955Version: ResolvedVersion = {
      ...stubVersion,
      handle: 'Reduced - 1955' as never
    };
    const hour: HourStructure = {
      hour: 'vespers',
      slots: {
        suffragium: { kind: 'empty' }
      },
      directives: ['suffragium-of-the-saints']
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        version: reduced1955Version,
        season: 'eastertide',
        dayName: 'Pasc5-0'
      }),
      version: reduced1955Version,
      hour: 'vespers',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(1);
    expect(composed.sections[0]!.reference).toBe(
      'horas/Latin/Psalterium/Special/Major Special#Suffragium Paschale'
    );
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Ant. Crucifíxus surréxit a mórtuis, allelúja.'
    );
  });

  it('preserves rubric prose from Common/Rubricae instead of stripping it from the rendered line stream', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Rubricae', 'Clara voce', [
        { type: 'rubric', value: 'Deinde, clara voce, dicitur Versus:' }
      ])
    );

    const divinoAfflatuVersion: ResolvedVersion = {
      ...stubVersion,
      handle: 'Divino Afflatu - 1954' as never
    };
    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        versicle: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Common/Rubricae', section: 'Clara voce' }
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        version: divinoAfflatuVersion,
        season: 'time-after-pentecost',
        dayName: 'Pent03-1'
      }),
      version: divinoAfflatuVersion,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections).toHaveLength(1);
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Deinde, clara voce, dicitur Versus:'
    );
  });

  it('expands formulaRef and macroRef from Common/Prayers', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Incipit', [
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
        // Uses the generic `incipit` slot rather than `hymn` — hymn-specific
        // per-line + stanza-break rendering in emit/sections.ts would add a
        // spurious `_` line between Oremus and Benedicamus here, even though
        // the source separator was synthetic (interleaveSeparators). Real
        // hymn content does not include formulaRef/macroRef expansions.
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Incipit' }
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

  it('selects the season-appropriate Alleluia line during Christmastide', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [{ type: 'macroRef', name: 'Alleluia' }])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Alleluia', [
        { type: 'verseMarker', marker: 'v.', text: 'Allelúja.' },
        { type: 'verseMarker', marker: 'v.', text: 'Laus tibi, Dómine, Rex ætérnæ glóriæ.' }
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

    const baseSummary = buildSummary(hour);
    const summary = {
      ...baseSummary,
      temporal: {
        ...baseSummary.temporal,
        season: 'christmastide'
      }
    };

    const composed = composeHour({
      corpus,
      summary,
      version: stubVersion,
      hour: 'compline',
      options: { languages: ['Latin'] }
    });

    expect(composed.sections[0]!.lines).toHaveLength(1);
    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Allelúja.');
  });

  it('expands rubric formulaRef entries from Common/Rubricae', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [{ type: 'formulaRef', name: 'rubrica Jube' }])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Rubricae', 'Jube', [
        { type: 'rubric', value: 'Extra Chorum, quando ab uno tantum recitatur Officium dicitur.' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe(
      'Extra Chorum, quando ab uno tantum recitatur Officium dicitur.'
    );
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

  it('expands psalmRef into antiphon plus Psalmorum content', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Incipit', [
        { type: 'psalmRef', psalmNumber: 117, antiphon: 'Ant. Confitémini Dómino.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm117', '__preamble', [
        { type: 'text', value: '117:1 Confitémini Dómino quóniam bonus.' },
        { type: 'text', value: '117:2 Dicat nunc Israël.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        // See sibling test for why we avoid `hymn` here.
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Incipit' }
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

    expect(renderRuns(composed.sections[0]!.lines[0]!, 'Latin')).toBe('Ant. Confitémini Dómino.');
    expect(renderRuns(composed.sections[0]!.lines[1]!, 'Latin')).toBe(
      '117:1 Confitémini Dómino quóniam bonus.'
    );
    expect(renderRuns(composed.sections[0]!.lines[2]!, 'Latin')).toBe('117:2 Dicat nunc Israël.');
  });

  it('replaces the fallback hymn doxology with the doxology-variant slot', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Prima Special', 'Hymnus Prima', [
        { type: 'text', value: 'Jam lucis orto sídere,' },
        { type: 'text', value: 'Deum precémur súpplices,' },
        { type: 'separator' },
        { type: 'text', value: '* Deo Patri sit glória,' },
        { type: 'text', value: 'Ejúsque soli Fílio,' },
        { type: 'text', value: 'Cum Spíritu Paráclito,' },
        { type: 'text', value: 'Nunc et per omne sǽculum.' },
        { type: 'text', value: 'Amen.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Doxologies', 'Nat', [
        { type: 'text', value: 'Jesu, tibi sit glória,' },
        { type: 'text', value: 'Qui natus es de Vírgine,' },
        { type: 'text', value: 'Cum Patre et almo Spíritu,' },
        { type: 'text', value: 'In sempitérna sǽcula.' },
        { type: 'text', value: 'Amen.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Special/Prima Special', section: 'Hymnus Prima' }
        },
        'doxology-variant': {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Doxologies', section: 'Nat' }
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

    expect(composed.sections.map((section) => section.slot)).toEqual(['hymn']);
    const hymnLines = composed.sections[0]!.lines.map((line) => renderRuns(line, 'Latin'));
    expect(hymnLines).toContain('Jesu, tibi sit glória,');
    expect(hymnLines).not.toContain('Deo Patri sit glória,');
  });

  it('suppresses wrapper closing antiphons when explicit psalmody antiphons are present', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Sancti/01-01', 'Ant Laudes', [
        { type: 'text', value: 'O admirábile commércium: * Creátor géneris humáni.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi major', 'Day0 Laudes1', [
        {
          type: 'psalmRef',
          psalmNumber: 92,
          antiphon: 'Ant. Allelúja, Dóminus regnávit, decórem índuit, allelúja, allelúja.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm92', '__preamble', [
        { type: 'text', value: '92:1 Dóminus regnávit, decórem indútus est.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sicut erat.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
                section: 'Day0 Laudes1',
                selector: '1'
              },
              antiphonRef: {
                path: 'horas/Latin/Sancti/01-01',
                section: 'Ant Laudes',
                selector: '1'
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

    const psalmodyLines = composed.sections[0]!.lines.map((line) => renderRuns(line, 'Latin'));
    expect(psalmodyLines[0]).toBe('O admirábile commércium: * Creátor géneris humáni.');
    expect(psalmodyLines.at(-1)).toBe('O admirábile commércium: Creátor géneris humáni.');
    expect(psalmodyLines).not.toContain(
      'Ant. Allelúja, Dóminus regnávit, decórem índuit, allelúja, allelúja.'
    );
  });

  it('preserves wrapper reopening antiphons and source-backed heading numbers across inline psalm overrides', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi/Psalmi major', 'Day0 Vespera', [
        {
          type: 'psalmRef',
          psalmNumber: 109,
          antiphon: 'Dixit Dóminus * Dómino meo: Sede a dextris meis.'
        },
        {
          type: 'psalmRef',
          psalmNumber: 116,
          antiphon: 'Magna ópera Dómini: * exquisíta in omnes voluntátes ejus.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm109', '__preamble', [
        { type: 'text', value: '109:1 Dixit Dóminus Dómino meo: * Sede a dextris meis:' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm116', '__preamble', [
        { type: 'text', value: '116:1 Laudáte Dóminum, omnes gentes: * laudáte eum, omnes pópuli:' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sicut erat.' }
      ])
    );

    const hour: HourStructure = {
      hour: 'vespers',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmi/Psalmi major',
                section: 'Day0 Vespera'
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
      hour: 'vespers',
      options: { languages: ['Latin'] }
    });

    const psalmodyLines = composed.sections[0]!.lines.map((line) => renderRuns(line, 'Latin'));
    expect(psalmodyLines).toContain('Dixit Dóminus * Dómino meo: Sede a dextris meis.');
    expect(psalmodyLines).toContain('Dixit Dóminus Dómino meo: Sede a dextris meis.');
    expect(psalmodyLines).toContain('Magna ópera Dómini: * exquisíta in omnes voluntátes ejus.');
    expect(psalmodyLines).toContain('Magna ópera Dómini: exquisíta in omnes voluntátes ejus.');

    const firstRepeat = psalmodyLines.indexOf('Dixit Dóminus Dómino meo: Sede a dextris meis.');
    const secondOpening = psalmodyLines.indexOf(
      'Magna ópera Dómini: * exquisíta in omnes voluntátes ejus.'
    );
    const secondHeading = psalmodyLines.indexOf('Psalmus 116 [2]');

    expect(firstRepeat).toBeGreaterThanOrEqual(0);
    expect(secondOpening).toBe(firstRepeat + 1);
    expect(secondHeading).toBe(secondOpening + 1);
  });

  it('keeps unmarked explicit antiphons as full opening and closing repeats', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Sancti/01-01', 'Ant 1', [
        { type: 'text', value: 'O admirábile commércium.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm92', '__preamble', [
        { type: 'text', value: '92:1 Dóminus regnávit, decórem indútus est.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sicut erat.' }
      ])
    );

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
              },
              antiphonRef: {
                path: 'horas/Latin/Sancti/01-01',
                section: 'Ant 1'
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

    const psalmodyLines = composed.sections[0]!.lines.map((line) => renderRuns(line, 'Latin'));
    expect(psalmodyLines.filter((line) => line === 'O admirábile commércium.')).toHaveLength(2);
  });

  it('renders pre-1960 minor-hour explicit antiphons with a shortened opening and full closing repeat', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Sancti/01-06', 'Ant Laudes', [
        {
          type: 'text',
          value: 'Ante lucíferum génitus, * et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.'
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm53', '__preamble', [
        { type: 'text', value: '53:3 Deus, in nómine tuo salvum me fac.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm54', '__preamble', [
        { type: 'text', value: '54:1 Exáudi, Deus, oratiónem meam.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sicut erat.' }
      ])
    );

    const reduced1955Version: ResolvedVersion = {
      ...stubVersion,
      handle: 'Reduced - 1955' as never
    };

    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        psalmody: {
          kind: 'psalmody',
          psalms: [
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm53',
                section: '__preamble'
              },
              antiphonRef: {
                path: 'horas/Latin/Sancti/01-06',
                section: 'Ant Laudes',
                selector: '1'
              }
            },
            {
              psalmRef: {
                path: 'horas/Latin/Psalterium/Psalmorum/Psalm54',
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
      summary: buildSummary(hour, { version: reduced1955Version }),
      version: reduced1955Version,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });

    const psalmodyLines = composed.sections[0]!.lines.map((line) => renderRuns(line, 'Latin'));
    expect(psalmodyLines[0]).toBe('Ante lucíferum génitus.');
    expect(psalmodyLines.at(-1)).toBe(
      'Ante lucíferum génitus, et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.'
    );
    expect(psalmodyLines.filter((line) => line.startsWith('Ante lucíferum génitus'))).toHaveLength(2);
  });

  it('keeps the Sunday keyed Psalmi minor opening at Terce while still shortening Prime in pre-1960', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFileMulti('horas/Latin/Psalterium/Psalmi/Psalmi minor', [
        {
          header: 'Tridentinum',
          content: [
            {
              type: 'text',
              value: 'Prima Dominica=Allelúja, * allelúja, allelúja;;53,117,118(1-16),118(17-32)'
            },
            {
              type: 'text',
              value: 'Tertia Dominica=Allelúja, * allelúja, allelúja;;118(33-48),118(49-64),118(65-80)'
            }
          ]
        },
        {
          header: 'Prima',
          content: [
            {
              type: 'text',
              value:
                'Dominica = Allelúja, * confitémini Dómino, quóniam in sǽculum misericórdia ejus, allelúja, allelúja.'
            }
          ]
        },
        {
          header: 'Tertia',
          content: [
            {
              type: 'text',
              value:
                'Dominica = Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.'
            }
          ]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm53', '__preamble', [
        { type: 'text', value: '53:3 Deus, in nómine tuo salvum me fac.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm118', '__preamble', [
        { type: 'text', value: '118:33 Legem pone mihi, Dómine.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Gloria', [
        { type: 'verseMarker', marker: 'V.', text: 'Glória Patri.' },
        { type: 'verseMarker', marker: 'R.', text: 'Sicut erat.' }
      ])
    );

    const reduced1955Version: ResolvedVersion = {
      ...stubVersion,
      handle: 'Reduced - 1955' as never
    };

    const composedPrime = composeHour({
      corpus,
      summary: buildSummary({
        hour: 'prime',
        slots: {
          psalmody: {
            kind: 'psalmody',
            psalms: [
              {
                antiphonRef: {
                  path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
                  section: 'Tridentinum',
                  selector: 'Prima Dominica#antiphon'
                },
                psalmRef: {
                  path: 'horas/Latin/Psalterium/Psalmorum/Psalm53',
                  section: '__preamble'
                }
              }
            ]
          }
        },
        directives: []
      }, { version: reduced1955Version }),
      version: reduced1955Version,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });

    const composedTerce = composeHour({
      corpus,
      summary: buildSummary({
        hour: 'terce',
        slots: {
          psalmody: {
            kind: 'psalmody',
            psalms: [
              {
                antiphonRef: {
                  path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
                  section: 'Tridentinum',
                  selector: 'Tertia Dominica#antiphon'
                },
                psalmRef: {
                  path: 'horas/Latin/Psalterium/Psalmorum/Psalm118',
                  section: '__preamble',
                  selector: '118(33-48)'
                }
              }
            ]
          }
        },
        directives: []
      }, { version: reduced1955Version }),
      version: reduced1955Version,
      hour: 'terce',
      options: { languages: ['Latin'] }
    });

    expect(slotLines(composedPrime, 'psalmody', 'Latin')[0]).toBe('Allelúja.');
    expect(slotLines(composedTerce, 'psalmody', 'Latin')[0]).toBe(
      'Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.'
    );
  });

  it('uses the parser fallback chain for deferred nodes on a resolved corpus', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/English/Commune/C4v', 'Incipit', [
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
        // See the psalmRef-expansion sibling test for why we avoid `hymn`.
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/C4v', section: 'Incipit' }
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

  it('falls back to Latin Prime Martyrologium files for Latin-derived locales', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Martyrologium1955R/04-03', '__preamble', [
        { type: 'text', value: 'Tértio Nonas Aprílis' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Conclmart', [
        {
          type: 'verseMarker',
          marker: 'V.',
          text: 'Et álibi aliórum plurimórum sanctórum Mártyrum.'
        }
      ])
    );

    const reduced1955Version: ResolvedVersion = {
      ...stubVersion,
      handle: 'Reduced - 1955' as never
    };
    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        martyrology: {
          kind: 'prime-martyrology'
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        version: reduced1955Version,
        date: '2024-04-02'
      }),
      version: reduced1955Version,
      hour: 'prime',
      options: { languages: ['Latin-Bea'], langfb: 'Latin' }
    });

    const martyrology = composed.sections.find((section) => section.slot === 'martyrology');
    expect(martyrology?.slot).toBe('martyrology');
    expect(renderRuns(martyrology!.lines[0]!, 'Latin-Bea')).toContain('Tértio Nonas Aprílis');
    expect(renderRuns(martyrology!.lines[1]!, 'Latin-Bea')).toBe(
      'Et álibi aliórum plurimórum sanctórum Mártyrum.'
    );
  });

  it('formats weekday Prime Martyrologium bodies as responsorial lines with separators', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Martyrologium1955R/04-03', '__preamble', [
        { type: 'text', value: 'Tértio Nonas Aprílis' },
        { type: 'separator' },
        { type: 'text', value: 'Romæ natális beáti Xysti Primi, Papæ et Mártyris.' },
        { type: 'text', value: 'Tauroménii, in Sicília, sancti Pancrátii Epíscopi.' }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Common/Prayers', 'Conclmart', [
        {
          type: 'verseMarker',
          marker: 'V.',
          text: 'Et álibi aliórum plurimórum sanctórum Mártyrum.'
        }
      ])
    );

    const reduced1955Version: ResolvedVersion = {
      ...stubVersion,
      handle: 'Reduced - 1955' as never
    };
    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        martyrology: {
          kind: 'prime-martyrology'
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        version: reduced1955Version,
        date: '2024-04-02'
      }),
      version: reduced1955Version,
      hour: 'prime',
      options: { languages: ['Latin'] }
    });

    const martyrology = composed.sections.find((section) => section.slot === 'martyrology');
    expect(martyrology?.slot).toBe('martyrology');
    expect(martyrology!.lines[0]!.marker).toBe('v.');
    expect(renderRuns(martyrology!.lines[0]!, 'Latin')).toBe(
      'Tértio Nonas Aprílis Luna vicésima tértia Anno Dómini 2024'
    );
    expect(renderRuns(martyrology!.lines[1]!, 'Latin')).toBe('_');
    expect(martyrology!.lines[2]!.marker).toBe('r.');
    expect(renderRuns(martyrology!.lines[2]!, 'Latin')).toBe(
      'Romæ natális beáti Xysti Primi, Papæ et Mártyris.'
    );
    expect(martyrology!.lines[3]!.marker).toBe('r.');
    expect(renderRuns(martyrology!.lines[3]!, 'Latin')).toBe(
      'Tauroménii, in Sicília, sancti Pancrátii Epíscopi.'
    );
    expect(martyrology!.lines[4]!.marker).toBe('V.');
  });

  it('avoids duplicating the civil date in the English Martyrologium moon label', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/English/Martyrologium/04-03', '__preamble', [
        { type: 'text', value: 'Upon the 3rd day of April, were born into the better life:' }
      ])
    );

    const hour: HourStructure = {
      hour: 'prime',
      slots: {
        martyrology: {
          kind: 'prime-martyrology'
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour, {
        date: '2024-04-02'
      }),
      version: stubVersion,
      hour: 'prime',
      options: { languages: ['English'], langfb: 'English' }
    });

    const martyrology = composed.sections.find((section) => section.slot === 'martyrology');
    expect(martyrology?.slot).toBe('martyrology');
    const firstLine = renderRuns(martyrology!.lines[0]!, 'English');
    expect(firstLine).toContain('Upon the 3rd day of April, were born into the better life:');
    expect(firstLine).toContain('the ');
    expect(firstLine).toContain('day of the Moon');
    expect(firstLine).not.toContain('April 3rd 2024');
  });
});
