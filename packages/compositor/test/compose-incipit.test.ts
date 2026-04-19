import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile, TextContent } from '@officium-novum/parser';
import type { DayOfficeSummary, HourStructure, ResolvedVersion } from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { stripLaudsSecretoPrayers } from '../src/compose/incipit.js';

// ---------------------------------------------------------------------------
// Unit tests for the stripLaudsSecretoPrayers helper.
// ---------------------------------------------------------------------------

describe('stripLaudsSecretoPrayers', () => {
  it('returns an empty array unchanged', () => {
    expect(stripLaudsSecretoPrayers([])).toEqual([]);
  });

  it('drops a top-level formulaRef named "Pater noster"', () => {
    const input: readonly TextContent[] = [
      { type: 'formulaRef', name: 'Pater noster' },
      { type: 'text', value: 'after' }
    ];
    expect(stripLaudsSecretoPrayers(input)).toEqual([{ type: 'text', value: 'after' }]);
  });

  it('drops formulaRef "Ave Maria" and the preceding "rubrica Secreto a Laudibus" rubric formula', () => {
    const input: readonly TextContent[] = [
      { type: 'formulaRef', name: 'rubrica Secreto a Laudibus' },
      { type: 'formulaRef', name: 'Pater noster' },
      { type: 'formulaRef', name: 'Ave Maria' },
      { type: 'separator' },
      { type: 'formulaRef', name: 'Deus in adjutorium' }
    ];
    expect(stripLaudsSecretoPrayers(input)).toEqual([
      { type: 'separator' },
      { type: 'formulaRef', name: 'Deus in adjutorium' }
    ]);
  });

  it('preserves formula refs whose names are not in the secreto block (e.g. Deus in adjutorium, Alleluia)', () => {
    const input: readonly TextContent[] = [
      { type: 'formulaRef', name: 'Deus in adjutorium' },
      { type: 'macroRef', name: 'Alleluia' }
    ];
    expect(stripLaudsSecretoPrayers(input)).toEqual(input);
  });

  it('matches formula names case-insensitively and trims surrounding whitespace', () => {
    const input: readonly TextContent[] = [
      { type: 'formulaRef', name: '  PATER NOSTER ' },
      { type: 'formulaRef', name: 'ave maria' },
      { type: 'formulaRef', name: 'Rubrica Secreto a Laudibus' },
      { type: 'text', value: 'keep' }
    ];
    expect(stripLaudsSecretoPrayers(input)).toEqual([{ type: 'text', value: 'keep' }]);
  });

  it('recurses into nested conditionals and drops matching refs at any depth', () => {
    const input: readonly TextContent[] = [
      {
        type: 'conditional',
        condition: { expression: { type: 'match', subject: 'rubrica', predicate: 'cisterciensis' } },
        scope: { backward: 'block', forward: 'line' },
        content: [
          {
            type: 'conditional',
            condition: { expression: { type: 'match', subject: 'rubrica', predicate: '^Trident' } },
            scope: { backward: 'block', forward: 'line' },
            content: [
              { type: 'formulaRef', name: 'rubrica Secreto a Laudibus' },
              { type: 'formulaRef', name: 'Pater noster' },
              { type: 'formulaRef', name: 'Ave Maria' },
              { type: 'formulaRef', name: 'Deus in adjutorium' }
            ]
          }
        ]
      }
    ];

    const output = stripLaudsSecretoPrayers(input);
    expect(output).toHaveLength(1);
    expect(output[0]!.type).toBe('conditional');
    const outer = output[0] as Extract<TextContent, { type: 'conditional' }>;
    expect(outer.content).toHaveLength(1);
    const inner = outer.content[0] as Extract<TextContent, { type: 'conditional' }>;
    expect(inner.content).toEqual([{ type: 'formulaRef', name: 'Deus in adjutorium' }]);
  });
});

// ---------------------------------------------------------------------------
// Integration with composeHour: joinLaudsToMatins semantics end-to-end.
// ---------------------------------------------------------------------------

const stubVersion: ResolvedVersion = {
  handle: 'Divino Afflatu - 1954' as never,
  kalendar: 'General-1939',
  transfer: 'General-1939',
  stransfer: 'General-1939',
  policy: {} as never
};

function buildSummary(hour: HourStructure): DayOfficeSummary {
  return {
    date: '2024-01-02',
    version: {
      handle: stubVersion.handle,
      kalendar: stubVersion.kalendar,
      transfer: stubVersion.transfer,
      stransfer: stubVersion.stransfer,
      policyName: 'divino-afflatu'
    },
    temporal: {
      date: '2024-01-02',
      dayOfWeek: 2,
      weekStem: 'Nat',
      dayName: 'Dies Octavæ Natalis',
      season: 'christmastide',
      feastRef: { path: 'horas/Latin/Tempora/Nat2-2', sectionRef: undefined } as never,
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

function buildIncipitCorpus(): InMemoryTextIndex {
  const corpus = new InMemoryTextIndex();
  const ordinariumSection: ParsedFile = {
    path: 'horas/Ordinarium/Laudes.txt',
    sections: [
      {
        header: 'Incipit',
        startLine: 1,
        endLine: 10,
        content: [
          { type: 'formulaRef', name: 'rubrica Secreto a Laudibus' },
          { type: 'formulaRef', name: 'Pater noster' },
          { type: 'formulaRef', name: 'Ave Maria' },
          { type: 'separator' },
          { type: 'formulaRef', name: 'Deus in adjutorium' }
        ]
      }
    ]
  };
  corpus.addFile(ordinariumSection);

  const prayers: ParsedFile = {
    path: 'horas/Latin/Psalterium/Common/Prayers.txt',
    sections: [
      {
        header: 'rubrica Secreto a Laudibus',
        startLine: 1,
        endLine: 1,
        content: [{ type: 'rubric', value: 'Secreto:' }]
      },
      {
        header: 'Pater noster',
        startLine: 2,
        endLine: 2,
        content: [{ type: 'text', value: 'Pater noster, qui es in cælis…' }]
      },
      {
        header: 'Ave Maria',
        startLine: 3,
        endLine: 3,
        content: [{ type: 'text', value: 'Ave Maria, gratia plena…' }]
      },
      {
        header: 'Deus in adjutorium',
        startLine: 4,
        endLine: 4,
        content: [{ type: 'verseMarker', marker: 'V.', text: 'Deus, in adjutórium meum inténde.' }]
      }
    ]
  };
  corpus.addFile(prayers);

  return corpus;
}

function renderIncipit(sections: readonly { readonly slot: string; readonly lines: ReadonlyArray<{ readonly texts: Record<string, ReadonlyArray<{ readonly type: string; readonly value?: string }>> }> }[]): string {
  const incipit = sections.find((s) => s.slot === 'incipit');
  if (!incipit) return '';
  return incipit.lines
    .flatMap((line) => Object.values(line.texts))
    .flat()
    .map((run) => ('value' in run ? run.value : ''))
    .join('|');
}

function buildLaudsHour(): HourStructure {
  return {
    hour: 'lauds',
    slots: {
      incipit: {
        kind: 'single-ref',
        ref: { path: 'horas/Ordinarium/Laudes.txt', section: 'Incipit' }
      }
    },
    directives: []
  };
}

function buildPrimeHour(): HourStructure {
  return {
    hour: 'prime',
    slots: {
      incipit: {
        kind: 'single-ref',
        ref: { path: 'horas/Ordinarium/Laudes.txt', section: 'Incipit' }
      }
    },
    directives: []
  };
}

describe('composeHour incipit semantics', () => {
  it('emits the secreto Pater / Ave block at Lauds when joinLaudsToMatins is false', () => {
    const corpus = buildIncipitCorpus();
    const composed = composeHour({
      corpus,
      summary: buildSummary(buildLaudsHour()),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'], joinLaudsToMatins: false }
    });
    const rendered = renderIncipit(composed.sections);
    expect(rendered).toContain('Pater noster');
    expect(rendered).toContain('Ave Maria');
    expect(rendered).toContain('Deus, in adjutórium');
  });

  it('emits the same output when joinLaudsToMatins is left unset (default == separated form)', () => {
    const corpus = buildIncipitCorpus();
    const composed = composeHour({
      corpus,
      summary: buildSummary(buildLaudsHour()),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });
    const rendered = renderIncipit(composed.sections);
    expect(rendered).toContain('Pater noster');
    expect(rendered).toContain('Ave Maria');
  });

  it('suppresses the secreto Pater / Ave block at Lauds when joinLaudsToMatins is true', () => {
    const corpus = buildIncipitCorpus();
    const composed = composeHour({
      corpus,
      summary: buildSummary(buildLaudsHour()),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'], joinLaudsToMatins: true }
    });
    const rendered = renderIncipit(composed.sections);
    expect(rendered).not.toContain('Pater noster');
    expect(rendered).not.toContain('Ave Maria');
    expect(rendered).toContain('Deus, in adjutórium');
  });

  it('treats joinLaudsToMatins as a no-op for Prime (only Lauds is affected)', () => {
    const corpus = buildIncipitCorpus();
    const composed = composeHour({
      corpus,
      summary: buildSummary(buildPrimeHour()),
      version: stubVersion,
      hour: 'prime',
      options: { languages: ['Latin'], joinLaudsToMatins: true }
    });
    const rendered = renderIncipit(composed.sections);
    // Prime's incipit reuses the same test corpus section, so Pater / Ave
    // remain present because the flag does nothing outside Lauds.
    expect(rendered).toContain('Pater noster');
    expect(rendered).toContain('Ave Maria');
  });

  it('leaves non-incipit slots alone even when joinLaudsToMatins is true at Lauds', () => {
    const corpus = buildIncipitCorpus();
    // Add a hymn slot that references one of the secreto formula names — the
    // filter must not reach outside the incipit slot.
    corpus.addFile({
      path: 'horas/Latin/Commune/Test.txt',
      sections: [
        {
          header: 'Hymnus',
          startLine: 1,
          endLine: 1,
          content: [{ type: 'formulaRef', name: 'Pater noster' }]
        }
      ]
    });
    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        incipit: {
          kind: 'single-ref',
          ref: { path: 'horas/Ordinarium/Laudes.txt', section: 'Incipit' }
        },
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Commune/Test.txt', section: 'Hymnus' }
        }
      },
      directives: []
    };
    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'lauds',
      options: { languages: ['Latin'], joinLaudsToMatins: true }
    });

    const hymnSection = composed.sections.find((s) => s.slot === 'hymn');
    expect(hymnSection).toBeDefined();
    // The hymn's $Pater noster formulaRef stays unresolved in the output
    // (the corpus's Prayers file is wired for incipit resolution, but
    // `unresolved-formula` is what surfaces for any unexpanded $-ref in this
    // test fixture). The key assertion: the hymn slot still contains a run
    // derived from the Pater noster ref, proving the incipit filter did not
    // leak.
    const hymnRuns = hymnSection!.lines.flatMap((line) => Object.values(line.texts).flat());
    const hasPaterNosterRun = hymnRuns.some((run) => {
      if ('value' in run && typeof run.value === 'string') {
        return run.value.includes('Pater noster');
      }
      if ('name' in run && typeof run.name === 'string') {
        return run.name === 'Pater noster';
      }
      return false;
    });
    expect(hasPaterNosterRun).toBe(true);
  });
});
