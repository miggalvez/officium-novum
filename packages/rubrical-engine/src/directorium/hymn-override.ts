import type { TransferEntry } from '@officium-novum/parser';

import type { HymnOverride, RubricalWarning } from '../types/directorium.js';

export function extractHymnOverride(
  entries: readonly TransferEntry[],
  dateKey: string
): {
  readonly hymnOverride?: HymnOverride;
  readonly warnings: readonly RubricalWarning[];
} {
  const warnings: RubricalWarning[] = [];

  for (const entry of entries) {
    if (entry.kind !== 'hymn' || entry.dateKey !== dateKey) {
      continue;
    }

    if (entry.value === '1') {
      return {
        hymnOverride: {
          hymnKey: entry.dateKey,
          mode: 'merge'
        },
        warnings
      };
    }

    if (entry.value === '2') {
      return {
        hymnOverride: {
          hymnKey: entry.dateKey,
          mode: 'shift'
        },
        warnings
      };
    }

    warnings.push({
      code: 'overlay-invalid-hymn-override',
      message: `Ignoring unknown hymn override value '${entry.value}' for ${entry.dateKey}.`,
      severity: 'warn',
      context: {
        dateKey: entry.dateKey,
        value: entry.value
      }
    });
  }

  return { warnings };
}
