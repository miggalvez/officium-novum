import type { TransferEntry } from '@officium-novum/parser';

import { sanctoralDateKey, type CalendarDate } from '../../internal/date.js';
import type { ResolvedVersion, VersionRegistry } from '../../types/version.js';

import { computeYearKey } from './year-key.js';

const ALL_HANDLES = '*';

type LeapChunk = 'all' | 'main' | 'companion';

export interface NamedYearTransferEntries {
  readonly yearKey: string;
  readonly entries: readonly TransferEntry[];
  /**
   * Optional transfer handle namespace.
   * Do not mix wildcard (`undefined`/`*`) and named handles in one table build.
   */
  readonly handle?: string;
}

export interface YearTransferChainLevel {
  readonly handle: string;
  readonly entries: readonly TransferEntry[];
}

export interface YearTransferTable {
  lookup(params: {
    readonly date: CalendarDate;
    readonly version: ResolvedVersion;
    readonly registry: VersionRegistry;
  }): readonly YearTransferChainLevel[];
}

class InMemoryYearTransferTable implements YearTransferTable {
  constructor(
    private readonly byHandle: ReadonlyMap<string, ReadonlyMap<string, readonly TransferEntry[]>>
  ) {}

  lookup(params: {
    readonly date: CalendarDate;
    readonly version: ResolvedVersion;
    readonly registry: VersionRegistry;
  }): readonly YearTransferChainLevel[] {
    const dateKey = sanctoralDateKey(params.date);
    const yearKey = computeYearKey(params.date.year);
    const handles = collectTransferHandleChain(params.version, params.registry);
    const levels: YearTransferChainLevel[] = [];

    for (const handle of handles) {
      const entries = this.lookupForHandle(handle, yearKey, dateKey);
      if (entries.length > 0) {
        levels.push({ handle, entries });
      }
    }

    return levels;
  }

  private lookupForHandle(
    handle: string,
    yearKey: ReturnType<typeof computeYearKey>,
    dateKey: string
  ): readonly TransferEntry[] {
    const byYear = this.byHandle.get(handle) ?? this.byHandle.get(ALL_HANDLES);
    if (!byYear) {
      return [];
    }

    const selected: TransferEntry[] = [];
    this.appendYearEntries(selected, byYear, yearKey.letter, dateKey, yearKey.isLeap ? 'main' : 'all');
    this.appendYearEntries(selected, byYear, yearKey.easterKey, dateKey, yearKey.isLeap ? 'main' : 'all');

    if (yearKey.isLeap) {
      if (yearKey.leapCompanionLetter) {
        this.appendYearEntries(selected, byYear, yearKey.leapCompanionLetter, dateKey, 'companion');
      }
      if (yearKey.leapCompanionEasterKey) {
        this.appendYearEntries(selected, byYear, yearKey.leapCompanionEasterKey, dateKey, 'companion');
      }
    }

    return selected;
  }

  private appendYearEntries(
    target: TransferEntry[],
    byYear: ReadonlyMap<string, readonly TransferEntry[]>,
    key: string,
    dateKey: string,
    chunk: LeapChunk
  ): void {
    const entries = byYear.get(key) ?? byYear.get(compactYearKey(key));
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      if (matchesLeapChunk(entry, dateKey, chunk)) {
        target.push(entry);
      }
    }
  }
}

function compactYearKey(key: string): string {
  if (!/^0\d{3}$/u.test(key)) {
    return key;
  }
  const compact = String(Number(key));
  return compact.length > 0 ? compact : key;
}

export function buildYearTransferTable(
  rawByYearKey: readonly NamedYearTransferEntries[]
): YearTransferTable {
  const byHandle = new Map<string, Map<string, readonly TransferEntry[]>>();
  let hasWildcardEntries = false;
  let hasNamedEntries = false;

  for (const table of rawByYearKey) {
    const yearKey = table.yearKey.trim();
    if (!yearKey) {
      continue;
    }
    const handle = normalizeHandle(table.handle);
    if (handle === ALL_HANDLES) {
      hasWildcardEntries = true;
    } else {
      hasNamedEntries = true;
    }

    if (hasWildcardEntries && hasNamedEntries) {
      throw new Error(
        'Cannot mix wildcard and named transfer handles in one YearTransferTable. Build separate tables or choose one handle strategy.'
      );
    }

    const byYear = byHandle.get(handle);
    if (byYear) {
      if (!byYear.has(yearKey)) {
        byYear.set(yearKey, [...table.entries]);
      }
      continue;
    }

    byHandle.set(handle, new Map([[yearKey, [...table.entries]]]));
  }

  return new InMemoryYearTransferTable(byHandle);
}

function normalizeHandle(handle: string | undefined): string {
  const value = handle?.trim();
  if (!value || value === ALL_HANDLES) {
    return ALL_HANDLES;
  }
  return value;
}

function matchesLeapChunk(entry: TransferEntry, dateKey: string, chunk: LeapChunk): boolean {
  if (entry.kind === 'dirge') {
    if (chunk === 'all') {
      return true;
    }
    return chunk === 'main' ? entry.dirgeNumber !== 1 : entry.dirgeNumber === 1;
  }

  if (entry.dateKey !== dateKey) {
    return false;
  }

  if (chunk === 'all') {
    return true;
  }

  if (chunk === 'main') {
    return (
      !matchesCompanionDateKey(entry.dateKey) &&
      !(entry.kind === 'transfer' && matchesMainExclusionTargetKey(entry.target))
    );
  }

  return matchesCompanionDateKey(entry.dateKey);
}

function matchesCompanionDateKey(value: string): boolean {
  return /^01/u.test(value) || /^02-(?:0\d|1\d|2[01239])/u.test(value);
}

function matchesMainExclusionTargetKey(value: string): boolean {
  return /^01/u.test(value) || /^02-(?:0\d|1\d|2[0123])/u.test(value);
}

function collectTransferHandleChain(
  version: ResolvedVersion,
  registry: VersionRegistry
): readonly string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: Pick<ResolvedVersion, 'handle' | 'transfer' | 'transferBase'> | undefined = version;

  while (current) {
    if (visited.has(current.handle)) {
      throw new Error(`Cycle detected in transferBase chain at version: ${current.handle}`);
    }
    visited.add(current.handle);
    chain.push(current.transfer);

    if (!current.transferBase) {
      break;
    }

    const next = registry.get(current.transferBase);
    if (!next) {
      throw new Error(`Unknown transferBase version in registry: ${current.transferBase}`);
    }

    current = {
      handle: next.handle,
      transfer: next.transfer,
      transferBase: next.transferBase
    };
  }

  return chain;
}
