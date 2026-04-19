import { describe, expect, it } from 'vitest';

import { InMemoryTextIndex } from '@officium-novum/parser';
import type { ParsedFile } from '@officium-novum/parser';
import type { DayOfficeSummary, HourStructure, ResolvedVersion } from '@officium-novum/rubrical-engine';

import { composeHour } from '../src/compose.js';
import { expandDeferredNodes } from '../src/resolve/expand-deferred-nodes.js';
import { resolveReference } from '../src/resolve/reference-resolver.js';
import type { ComposeWarning } from '../src/types/composed-hour.js';

const stubVersion: ResolvedVersion = {
  handle: 'Rubrics 1960 - 1960' as never,
  kalendar: 'General-1960',
  transfer: 'General-1960',
  stransfer: 'General-1960',
  policy: {} as never
};

function buildSummary(hour: HourStructure): DayOfficeSummary {
  return {
    date: '2024-01-14',
    version: {
      handle: stubVersion.handle,
      kalendar: stubVersion.kalendar,
      transfer: stubVersion.transfer,
      stransfer: stubVersion.stransfer,
      policyName: 'rubrics-1960'
    },
    temporal: {
      date: '2024-01-14',
      dayOfWeek: 0,
      weekStem: 'Pent',
      dayName: 'Dominica II post Epiphaniam',
      season: 'time-after-epiphany',
      feastRef: { path: 'horas/Latin/Tempora/Epi2-0', sectionRef: undefined } as never,
      rank: {} as never
    },
    warnings: [],
    celebration: { feastRef: { title: 'Test' } } as never,
    celebrationRules: {} as never,
    commemorations: [],
    concurrence: {} as never,
    compline: {} as never,
    hours: { [hour.hour]: hour },
    candidates: [],
    winner: {} as never
  };
}

function makeFile(path: string, header: string, content: ParsedFile['sections'][number]['content']): ParsedFile {
  return {
    path: `${path}.txt`,
    sections: [{ header, content, startLine: 1, endLine: 1 }]
  };
}

// ---------------------------------------------------------------------------
// Unit tests for the resolver/expander warning sinks.
// ---------------------------------------------------------------------------

describe('resolveReference warnings', () => {
  it('emits `resolve-missing-section` when the fallback chain exhausts', () => {
    const corpus = new InMemoryTextIndex();
    const warnings: ComposeWarning[] = [];
    const resolved = resolveReference(
      corpus,
      { path: 'horas/Latin/Missing/File', section: 'Hymnus' },
      {
        languages: ['Latin'],
        onWarning: (w) => warnings.push(w)
      }
    );
    expect(resolved).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('resolve-missing-section');
    expect(warnings[0]!.severity).toBe('warn');
    expect(warnings[0]!.context?.path).toBe('horas/Latin/Missing/File');
    expect(warnings[0]!.context?.language).toBe('Latin');
  });

  it('emits a warning per language when multiple languages fail to resolve', () => {
    const corpus = new InMemoryTextIndex();
    const warnings: ComposeWarning[] = [];
    resolveReference(
      corpus,
      { path: 'horas/Latin/Missing/File', section: 'Hymnus' },
      {
        languages: ['Latin', 'English'],
        onWarning: (w) => warnings.push(w)
      }
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.context?.language).sort()).toEqual(['English', 'Latin']);
  });

  it('does not emit resolve warnings when the section is found', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Te lucis ante terminum' }
      ])
    );
    const warnings: ComposeWarning[] = [];
    const resolved = resolveReference(
      corpus,
      { path: 'horas/Latin/Commune/C4v', section: 'Hymnus' },
      {
        languages: ['Latin'],
        onWarning: (w) => warnings.push(w)
      }
    );
    expect(resolved.Latin).toBeDefined();
    expect(warnings).toEqual([]);
  });

  it('emits `resolve-unhandled-selector` at `info` severity for selectors without a narrowing path', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Te lucis' },
        { type: 'text', value: 'ante terminum' }
      ])
    );
    const warnings: ComposeWarning[] = [];
    const resolved = resolveReference(
      corpus,
      {
        path: 'horas/Latin/Commune/C4v',
        section: 'Hymnus',
        selector: 'nonsense-selector-string'
      },
      {
        languages: ['Latin'],
        onWarning: (w) => warnings.push(w)
      }
    );
    expect(resolved.Latin?.selectorUnhandled).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('resolve-unhandled-selector');
    expect(warnings[0]!.severity).toBe('info');
    expect(warnings[0]!.context?.selector).toBe('nonsense-selector-string');
  });
});

describe('expandDeferredNodes warnings', () => {
  it('emits `deferred-depth-exhausted` at `warn` severity when maxDepth hits zero', () => {
    const corpus = new InMemoryTextIndex();
    const warnings: ComposeWarning[] = [];
    const result = expandDeferredNodes(
      [{ type: 'formulaRef', name: 'Does not matter' }],
      {
        index: corpus,
        language: 'Latin',
        season: 'time-after-pentecost',
        seen: new Set(),
        maxDepth: 0,
        onWarning: (w) => warnings.push(w)
      }
    );
    // With maxDepth=0 the function short-circuits and returns the input
    // unchanged.
    expect(result).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('deferred-depth-exhausted');
    expect(warnings[0]!.severity).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// Integration: composeHour aggregates warnings onto ComposedHour.warnings.
// ---------------------------------------------------------------------------

describe('composeHour.warnings aggregation', () => {
  it('surfaces a resolve-missing-section warning from a single slot', () => {
    const corpus = new InMemoryTextIndex();
    const hour: HourStructure = {
      hour: 'compline',
      slots: {
        hymn: {
          kind: 'single-ref',
          ref: { path: 'horas/Latin/Missing/File', section: 'Hymnus' }
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
    expect(composed.warnings.length).toBeGreaterThanOrEqual(1);
    expect(composed.warnings.some((w) => w.code === 'resolve-missing-section')).toBe(true);
  });

  it('returns an empty warnings array when every slot resolves cleanly', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Hymnus', [
        { type: 'text', value: 'Te lucis ante terminum' }
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
    expect(composed.warnings).toEqual([]);
  });

  it('surfaces deferred macro/formula resolution failures through ComposedHour.warnings', () => {
    const corpus = new InMemoryTextIndex();
    corpus.addFile(
      makeFile('horas/Latin/Commune/C4v', 'Incipit', [
        { type: 'formulaRef', name: 'Missing Formula' }
      ])
    );
    const hour: HourStructure = {
      hour: 'compline',
      slots: {
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

    expect(composed.warnings.some((warning) => warning.code === 'resolve-missing-section')).toBe(
      true
    );
  });
});
