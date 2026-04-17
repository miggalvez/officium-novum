import type { ScriptureTransferEntry, TransferEntry } from '@officium-novum/parser';

import { addDays, sanctoralDateKey, type CalendarDate } from '../internal/date.js';
import type { DirectoriumOverlay, RubricalWarning } from '../types/directorium.js';
import type { VersionRegistry } from '../types/version.js';
import type { ResolvedVersion } from '../types/version.js';

import { extractDirge } from './dirge.js';
import { extractHymnOverride } from './hymn-override.js';
import { extractOfficeSubstitution } from './office-substitution.js';
import { extractScriptureTransfer } from './scripture-redirect.js';
import type { ScriptureTransferTable } from './tables/scripture-transfer-table.js';
import type { YearTransferTable } from './tables/year-transfer-table.js';

export function buildOverlay(params: {
  readonly date: CalendarDate;
  readonly version: ResolvedVersion;
  readonly registry: VersionRegistry;
  readonly yearTransfers: YearTransferTable;
  readonly scriptureTransfers: ScriptureTransferTable;
}): {
  readonly overlay: DirectoriumOverlay;
  readonly warnings: readonly RubricalWarning[];
} {
  const dateKey = sanctoralDateKey(params.date);
  const nextDateKey = sanctoralDateKey(addDays(params.date, 1));
  const transferLevels = params.yearTransfers.lookup({
    date: params.date,
    version: params.version,
    registry: params.registry
  });
  const scriptureLevels = params.scriptureTransfers.lookup({
    date: params.date,
    version: params.version,
    registry: params.registry
  });

  const effectiveTransferEntries = pickEffectiveTransferEntries(
    transferLevels,
    (entry) => entry.kind === 'transfer' && entry.dateKey === dateKey
  );
  const effectiveHymnEntries = pickEffectiveTransferEntries(
    transferLevels,
    (entry) => entry.kind === 'hymn' && entry.dateKey === dateKey
  );
  const effectiveDirge1Entries = pickEffectiveTransferEntries(
    transferLevels,
    (entry) => entry.kind === 'dirge' && entry.dirgeNumber === 1
  );
  const effectiveDirge2Entries = pickEffectiveTransferEntries(
    transferLevels,
    (entry) => entry.kind === 'dirge' && entry.dirgeNumber === 2
  );
  const effectiveDirge3Entries = pickEffectiveTransferEntries(
    transferLevels,
    (entry) => entry.kind === 'dirge' && entry.dirgeNumber === 3
  );
  const effectiveScriptureEntries = pickEffectiveScriptureEntries(
    scriptureLevels,
    dateKey
  );

  const officeResult = extractOfficeSubstitution(
    effectiveTransferEntries,
    dateKey,
    params.version
  );
  const hymnResult = extractHymnOverride(effectiveHymnEntries, dateKey);
  const dirge = extractDirge(
    [
      ...effectiveDirge1Entries,
      ...effectiveDirge2Entries,
      ...effectiveDirge3Entries
    ],
    dateKey,
    nextDateKey
  );
  const scriptureTransfer = extractScriptureTransfer(
    effectiveScriptureEntries,
    dateKey
  );

  const overlay: DirectoriumOverlay = {
    ...(officeResult.officeSubstitution
      ? { officeSubstitution: officeResult.officeSubstitution }
      : {}),
    ...dirge,
    ...(hymnResult.hymnOverride ? { hymnOverride: hymnResult.hymnOverride } : {}),
    ...(scriptureTransfer ? { scriptureTransfer } : {})
  };

  return {
    overlay,
    warnings: [...officeResult.warnings, ...hymnResult.warnings]
  };
}

export function matchesVersionFilter(
  versionFilter: string | undefined,
  versionName: string
): boolean {
  const filter = versionFilter?.trim();
  if (!filter) {
    return true;
  }

  if (matchesFilterByRegex(filter, versionName)) {
    return true;
  }

  // Perl evaluates `$filter =~ /$versionName/` (Directorium.pm:132-136).
  // Tokenized fallback keeps behaviour literal if JS regex escaping differs.
  return filter
    .split(/\s+/u)
    .some((token) => token.includes(versionName));
}

function pickEffectiveTransferEntries(
  levels: ReadonlyArray<{
    readonly handle: string;
    readonly entries: readonly TransferEntry[];
  }>,
  predicate: (entry: TransferEntry) => boolean
): readonly TransferEntry[] {
  for (const level of levels) {
    const entries = level.entries.filter(
      (entry) =>
        predicate(entry) &&
        matchesVersionFilter(entry.versionFilter, level.handle)
    );
    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

function pickEffectiveScriptureEntries(
  levels: ReadonlyArray<{
    readonly handle: string;
    readonly entries: readonly ScriptureTransferEntry[];
  }>,
  dateKey: string
): readonly ScriptureTransferEntry[] {
  for (const level of levels) {
    const entries = level.entries.filter(
      (entry) =>
        entry.dateKey === dateKey &&
        matchesVersionFilter(entry.versionFilter, level.handle)
    );
    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

function matchesFilterByRegex(filter: string, versionName: string): boolean {
  try {
    return new RegExp(versionName, 'u').test(filter);
  } catch {
    return false;
  }
}
