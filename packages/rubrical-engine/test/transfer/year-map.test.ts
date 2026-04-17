import { parseKalendarium } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferMap,
  buildYearTransferTable,
  dayNameForDate,
  walkTransferTargetDate,
  type RubricalPolicy
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';
import { makeTestPolicy } from '../policy-fixture.js';

describe('buildYearTransferMap', () => {
  it('materializes transfers and exposes target-date lookup', () => {
    const policy = makeTransferPolicy();
    const { version, registry, kalendarium, corpus } = makeEnvironment({
      year: 2024,
      kalendariumRows: ['01-01=01-01=Transferred Feast=5='],
      sanctoralKeys: ['01-01'],
      temporalOverrides: {
        '2024-01-01': 1000
      }
    });

    const map = buildYearTransferMap({
      year: 2024,
      version,
      policy,
      corpus,
      versionRegistry: registry,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([])
    });

    expect(map.transfersOutOf('2024-01-01')).toHaveLength(1);
    expect(map.transfersOutOf('2024-01-01')[0]?.target).toBe('2024-01-02');
    expect(map.transfersInto('2024-01-02').map((entry) => entry.feastRef.path)).toEqual([
      'Sancti/01-01'
    ]);
  });

  it('uses recursion guard so identical in-flight transfers do not block themselves', () => {
    const policy = makeTransferPolicy();
    const { version, registry, kalendarium, corpus } = makeEnvironment({
      year: 2024,
      kalendariumRows: ['01-01=01-01~01-01=Duplicated Transfer Feast=5='],
      sanctoralKeys: ['01-01'],
      temporalOverrides: {
        '2024-01-01': 1000
      }
    });

    const map = buildYearTransferMap({
      year: 2024,
      version,
      policy,
      corpus,
      versionRegistry: registry,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([])
    });

    expect(map.transfersOutOf('2024-01-01')).toHaveLength(2);
    expect(map.transfersInto('2024-01-02')).toHaveLength(2);
  });

  it('supports cross-year transfer targets when the 60-day walk crosses Dec 31', () => {
    const policy = makeTransferPolicy();
    const { version, registry, kalendarium, corpus } = makeEnvironment({
      year: 2024,
      kalendariumRows: ['12-30=12-30=End of Year Transfer Feast=5='],
      sanctoralKeys: ['12-30'],
      temporalOverrides: {
        '2024-12-30': 1000,
        '2024-12-31': 1000
      }
    });

    const map = buildYearTransferMap({
      year: 2024,
      version,
      policy,
      corpus,
      versionRegistry: registry,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([])
    });

    const transfer = map.transfersOutOf('2024-12-30')[0];
    expect(transfer?.target).toBe('2025-01-01');
    expect(map.transfersInto('2025-01-01').map((entry) => entry.feastRef.path)).toContain(
      'Sancti/12-30'
    );
  });

  it('emits a synthesis warning when a Tempora office file is missing during preview build', () => {
    const policy = makeTransferPolicy();
    const { version, registry } = makeEnvironment({
      year: 2024,
      kalendariumRows: [],
      sanctoralKeys: [],
      temporalOverrides: {}
    });
    const map = buildYearTransferMap({
      year: 2024,
      version,
      policy,
      corpus: new TestOfficeTextIndex(),
      versionRegistry: registry,
      kalendarium: buildKalendariumTable([]),
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([])
    });

    const warnings = map.warningsOn('2024-01-01');
    expect(
      warnings.some(
        (warning) =>
          warning.code === 'rubric-synth-fallback' &&
          warning.context?.scope === 'temporal-context' &&
          warning.context?.date === '2024-01-01'
      )
    ).toBe(true);
  });

  it('does not swallow Sanctoral rank-selection errors during preview build', () => {
    const policy = makeTransferPolicy();
    const { version, registry, kalendarium, corpus } = makeEnvironment({
      year: 2024,
      kalendariumRows: ['01-01=01-01=Broken rank candidate=5='],
      sanctoralKeys: [],
      temporalOverrides: {}
    });
    const jan1DayName = dayNameForDate('2024-01-01');
    corpus.add(
      `horas/Latin/Tempora/${jan1DayName}.txt`,
      ['[Officium]', jan1DayName, '', '[Rank]', ';;Feria;;1;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/01-01.txt',
      [
        '[Officium]',
        'Broken rank candidate',
        '',
        '[Rank]',
        '(nisi rubrica 1960)',
        'Broken rank candidate;;Duplex I classis;;5;;'
      ].join('\n')
    );

    expect(() =>
      buildYearTransferMap({
        year: 2024,
        version,
        policy,
        corpus,
        versionRegistry: registry,
        kalendarium,
        yearTransfers: buildYearTransferTable([]),
        scriptureTransfers: buildScriptureTransferTable([])
      })
    ).toThrow('No matching [Rank] line found in horas/Latin/Sancti/01-01.txt');
  });
});

function makeEnvironment(params: {
  readonly year: number;
  readonly kalendariumRows: readonly string[];
  readonly sanctoralKeys: readonly string[];
  readonly temporalOverrides: Readonly<Record<string, number>>;
}): {
  readonly version: {
    readonly handle: ReturnType<typeof asVersionHandle>;
    readonly kalendar: string;
    readonly transfer: string;
    readonly stransfer: string;
    readonly policy: RubricalPolicy;
  };
  readonly registry: ReturnType<typeof buildVersionRegistry>;
  readonly kalendarium: ReturnType<typeof buildKalendariumTable>;
  readonly corpus: TestOfficeTextIndex;
} {
  const corpus = new TestOfficeTextIndex();
  seedTemporalCorpus(corpus, params.year, params.temporalOverrides);
  for (const key of params.sanctoralKeys) {
    corpus.add(
      `horas/Latin/Sancti/${key}.txt`,
      ['[Officium]', `Sancti ${key}`, '', '[Rank]', `Sancti ${key};;Duplex I classis;;5;;`].join('\n')
    );
  }

  const registry = buildVersionRegistry([
    {
      version: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960'
    }
  ]);
  const policy = makeTransferPolicy();
  const version = {
    handle: asVersionHandle('Rubrics 1960 - 1960'),
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    policy
  } as const;

  const kalendarium = buildKalendariumTable([
    {
      name: '1960',
      entries: parseKalendarium(`${params.kalendariumRows.join('\n')}\n`)
    }
  ]);

  return { version, registry, kalendarium, corpus };
}

function seedTemporalCorpus(
  corpus: TestOfficeTextIndex,
  year: number,
  overrides: Readonly<Record<string, number>>
): void {
  const seen = new Set<string>();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 2, 31));

  for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const isoDate = `${current.getUTCFullYear().toString().padStart(4, '0')}-${(current.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}-${current.getUTCDate().toString().padStart(2, '0')}`;
    const dayName = dayNameForDate(isoDate);
    if (seen.has(dayName)) {
      continue;
    }
    seen.add(dayName);

    const weight = overrides[isoDate] ?? 1;
    corpus.add(
      `horas/Latin/Tempora/${dayName}.txt`,
      ['[Officium]', dayName, '', '[Rank]', `;;Feria;;${weight};;`].join('\n')
    );
  }
}

function makeTransferPolicy(): RubricalPolicy {
  const base = makeTestPolicy('rubrics-1960', { defaultFate: 'transfer' });
  const compareCandidates: RubricalPolicy['compareCandidates'] = (left, right) => {
    if (left.rank.weight !== right.rank.weight) {
      return right.rank.weight - left.rank.weight;
    }
    const leftOrder = left.source === 'temporal' ? 0 : 1;
    const rightOrder = right.source === 'temporal' ? 0 : 1;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.feastRef.path.localeCompare(right.feastRef.path);
  };

  return {
    ...base,
    compareCandidates,
    transferTarget(candidate, fromDate, until, dayContext, overlayFor, occupantOn) {
      return walkTransferTargetDate({
        impeded: candidate,
        fromDate,
        until,
        dayContext,
        overlayFor,
        occupantOn,
        compareCandidates
      });
    }
  };
}
