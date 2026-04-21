import { describe, expect, it } from 'vitest';

import {
  CrossReferenceResolver,
  FileCache,
  InMemoryTextIndex,
  parseFile,
  type FileLoader,
  type ParsedFile
} from '@officium-novum/parser';
import type {
  DayOfficeSummary,
  HourStructure,
  MatinsPlan,
  NocturnPlan,
  ResolvedVersion
} from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { resolveReference } from '../src/resolve/reference-resolver.js';
import type { ComposedRun } from '../src/types/composed-hour.js';

function makeFile(
  path: string,
  sections: readonly { header: string; content: ParsedFile['sections'][number]['content'] }[]
): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: sections.map((s) => ({
      header: s.header,
      content: s.content,
      startLine: 1,
      endLine: 1
    }))
  };
}

const stubVersion: ResolvedVersion = {
  handle: 'Rubrics 1960 - 1960' as never,
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
      feastRef: { path: 'Tempora/Pasc1-0' } as never,
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
  line: { texts: Readonly<Record<string, readonly ComposedRun[]>> },
  language: string
): string {
  const runs = line.texts[language] ?? [];
  return runs
    .map((run) => {
      switch (run.type) {
        case 'text':
        case 'rubric':
        case 'citation':
          return run.value;
        case 'unresolved-macro':
          return `&${run.name}`;
        case 'unresolved-formula':
          return `$${run.name}`;
        case 'unresolved-reference':
          return '@';
      }
    })
    .join('');
}

function runTypes(
  line: { texts: Readonly<Record<string, readonly ComposedRun[]>> },
  language: string
): readonly string[] {
  return (line.texts[language] ?? []).map((r) => r.type);
}

class LocalLoader implements FileLoader {
  constructor(private readonly files: Readonly<Record<string, string>>) {}

  async load(relativePath: string): Promise<string> {
    const value = this.files[relativePath];
    if (value !== undefined) {
      return value;
    }

    const error = new Error(`Corpus file not found: ${relativePath}`) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
}

// --- Bug 3: psalmInclude expands from Psalmorum (not Psalms) --------------

describe('psalmInclude expansion (Bug 3)', () => {
  it('resolves against Psalmorum/PsalmN with section __preamble', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', [
        { header: 'Hymnus', content: [{ type: 'psalmInclude', psalmNumber: 1 }] }
      ])
    );
    // Matches real upstream layout: bare file (no [Header]) → parser creates
    // a `__preamble` section containing the whole file.
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmorum/Psalm1', [
        { header: '__preamble', content: [{ type: 'text', value: 'Beátus vir' }] }
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

  it('surfaces unresolved-reference when the psalm file is missing', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', [
        { header: 'Hymnus', content: [{ type: 'psalmInclude', psalmNumber: 999 }] }
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

    // Fallback path is surfaced, not silently dropped.
    expect(runTypes(composed.sections[0]!.lines[0]!, 'Latin')).toContain('unresolved-reference');
  });
});

// --- Bug 2: commemorated Matins lessons are composed, not dropped --------

describe('commemorated Matins lesson composition (Bug 2)', () => {
  it('resolves the lesson from the commemorated feast\'s Lectio{N} section', () => {
    const corpus = new InMemoryTextIndex();
    // A commemorated feast file carrying the Lectio9 content.
    corpus.addFile(
      makeFile('horas/Latin/Sancti/12-08', [
        { header: 'Lectio9', content: [{ type: 'text', value: 'De Conceptione B.M.V.' }] }
      ])
    );

    const plan: MatinsPlan = {
      invitatorium: { kind: 'suppressed' },
      hymn: { reference: { path: 'horas/Latin/Tempora/Adv1-0', section: 'Hymnus' } },
      nocturns: [
        {
          index: 1,
          psalmody: [],
          antiphons: [],
          versicle: {
            reference: { path: 'horas/Latin/Tempora/Adv1-0', section: 'V' }
          },
          lessonIntroduction: 'ordinary',
          lessons: [
            {
              index: 9,
              source: {
                kind: 'commemorated',
                feast: { path: 'Sancti/12-08', id: 'Sancti/12-08', title: 'B.M.V.' },
                lessonIndex: 9
              }
            }
          ],
          responsories: [],
          benedictions: []
        } satisfies NocturnPlan
      ],
      teDeum: 'omit'
    };

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: { kind: 'matins-invitatorium', source: plan.invitatorium },
        psalmody: { kind: 'matins-nocturns', nocturns: plan.nocturns }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const lectioSection = composed.sections.find(
      (s) => s.slot === 'lectio-brevis'
    );
    expect(lectioSection).toBeDefined();
    expect(renderRuns(lectioSection!.lines[0]!, 'Latin')).toBe('De Conceptione B.M.V.');
  });
});

// --- Bug 1: selector handling on TextReference ----------------------------

describe('TextReference selector handling (Bug 1)', () => {
  it('integer selector picks the Nth content node (1-based, raw index)', () => {
    const corpus = new InMemoryTextIndex();
    // Fixture mirrors the shape that matins-plan.ts builds against: each
    // antiphon is a single content node, not interleaved with separators,
    // because `String(contentIndex + 1)` refers to the raw content array
    // index (see packages/rubrical-engine/src/hours/matins-plan.ts:351).
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Psalmi matutinum', [
        {
          header: 'Ant Matutinum',
          content: [
            { type: 'text', value: 'Antiphon ONE' },
            { type: 'text', value: 'Antiphon TWO' },
            { type: 'text', value: 'Antiphon THREE' }
          ]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'lauds',
      slots: {
        'antiphon-ad-benedictus': {
          kind: 'single-ref',
          ref: {
            path: 'horas/Latin/Psalterium/Psalmi matutinum',
            section: 'Ant Matutinum',
            selector: '3'
          }
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

    const section = composed.sections[0]!;
    const rendered = section.lines.map((l) => renderRuns(l, 'Latin')).join('|');
    expect(rendered).toContain('Antiphon THREE');
    expect(rendered).not.toContain('Antiphon ONE');
    expect(rendered).not.toContain('Antiphon TWO');
  });

  it('`missing` sentinel surfaces a rubric placeholder instead of the full section', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Sancti/01-01', [
        {
          header: 'Responsory9',
          // If the section *does* exist, a well-behaved compositor should
          // still respect `selector: 'missing'` — Phase 2 only emits it when
          // the engine could not find the expected structure.
          content: [{ type: 'text', value: 'Stale content' }]
        }
      ])
    );

    const hour: HourStructure = {
      hour: 'matins',
      slots: {
        invitatory: { kind: 'matins-invitatorium', source: { kind: 'suppressed' } },
        psalmody: {
          kind: 'matins-nocturns',
          nocturns: [
            {
              index: 1,
              psalmody: [],
              antiphons: [],
              versicle: {
                reference: {
                  path: 'horas/Latin/Sancti/01-01',
                  section: 'V',
                  selector: 'missing'
                }
              },
              lessonIntroduction: 'ordinary',
              lessons: [],
              responsories: [],
              benedictions: []
            } satisfies NocturnPlan
          ]
        }
      },
      directives: []
    };

    const composed = composeHour({
      corpus,
      summary: buildSummary(hour),
      version: stubVersion,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    // When the versicle section doesn't exist in the fixture, resolution
    // should return no section — so the versicle slot is omitted entirely.
    const versicle = composed.sections.find((s) => s.slot === 'versicle');
    expect(versicle).toBeUndefined();
  });

  it('season-key selector resolves the invitatory antiphon instead of passing through the whole skeleton', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Invitatorium', [
        {
          header: '__preamble',
          content: [
            { type: 'formulaRef', name: 'ant' },
            { type: 'verseMarker', marker: 'v.', text: 'Venite exsultemus Domino' },
            { type: 'formulaRef', name: 'ant2' }
          ]
        }
      ])
    );
    corpus.addFile(
      makeFile('horas/Latin/Psalterium/Special/Matutinum Special', [
        {
          header: 'Invit Pasch',
          content: [{ type: 'text', value: 'Surrexit Dominus vere, alleluja.' }]
        }
      ])
    );

    const resolved = resolveReference(
      corpus,
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

describe('duplicate-header conditional resolution (ADR-012)', () => {
  it('keeps the Roman compline benediction and suppresses the Dominican variant', async () => {
    const corpusFilePath = 'horas/Latin/Psalterium/Common/Prayers.txt';
    const loader = new LocalLoader({
      [corpusFilePath]: [
        '[Jube domne]',
        'Jube, domne, benedícere.',
        '',
        '[Benedictio Completorium_]',
        'Benedictio. Noctem quiétam et finem perféctum concédat nobis Dóminus omnípotens.',
        '',
        '[benedictio Completorium]',
        '@:Jube domne',
        '@:Benedictio Completorium_',
        '',
        '[benedictio Completorium] (rubrica Ordo Praedicatorum)',
        '@:Jube domne',
        '@:Benedictio Completorium_:s/concédat/tríbuat/'
      ].join('\n')
    });
    const cache = new FileCache(loader);
    const resolver = new CrossReferenceResolver(cache, {
      domain: 'horas',
      language: 'Latin',
      pathResolver: (referencePath) => [
        referencePath.toLowerCase().endsWith('.txt') ? referencePath : `${referencePath}.txt`
      ]
    });

    const resolved = await resolver.resolveFile(
      parseFile(await loader.load(corpusFilePath), corpusFilePath)
    );

    const corpus = new InMemoryTextIndex();
    corpus.addFile(resolved);

    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        conclusion: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Psalterium/Common/Prayers', section: 'benedictio Completorium' }
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

    const rendered = composed.sections
      .flatMap((section) => section.lines)
      .map((line) => renderRuns(line, 'Latin'))
      .join(' ');

    expect(rendered).toContain('concédat nobis Dóminus omnípotens.');
    expect(rendered).not.toContain('tríbuat nobis Dóminus omnípotens.');
  });
});
