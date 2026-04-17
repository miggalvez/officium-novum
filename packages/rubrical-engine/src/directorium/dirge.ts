import type { TransferEntry } from '@officium-novum/parser';

import type { DirgeAttachment } from '../types/directorium.js';

export interface ExtractDirgeResult {
  readonly dirgeAtLauds?: DirgeAttachment;
  readonly dirgeAtVespers?: DirgeAttachment;
}

export function extractDirge(
  entries: readonly TransferEntry[],
  dateKey: string,
  nextDateKey: string
): ExtractDirgeResult {
  // Perl evaluates per-hour: Lauds uses today's sday, Vespers uses nextday,
  // and both checks run against the union of dirge1/2/3 (Directorium.pm:229-237).
  const dirgeAtLauds = findDirgeByDate(entries, dateKey);
  const dirgeAtVespers = findDirgeByDate(entries, nextDateKey);

  return {
    ...(dirgeAtLauds ? { dirgeAtLauds } : {}),
    ...(dirgeAtVespers ? { dirgeAtVespers } : {})
  };
}

function findDirgeByDate(
  entries: readonly TransferEntry[],
  matchedDateKey: string
): DirgeAttachment | undefined {
  for (const entry of entries) {
    if (entry.kind !== 'dirge') {
      continue;
    }
    if (!entry.dates.includes(matchedDateKey)) {
      continue;
    }
    // Source is diagnostic only; ties resolve by first table line in input order.
    return {
      source: entry.dirgeNumber,
      matchedDateKey
    };
  }

  return undefined;
}
