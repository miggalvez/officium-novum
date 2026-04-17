import type { KalendariumEntry } from '@officium-novum/parser';

import type { KalendariumTable } from '../types/model.js';

export interface NamedKalendariumEntries {
  readonly name: string;
  readonly entries: readonly KalendariumEntry[];
}

class InMemoryKalendariumTable implements KalendariumTable {
  private readonly tables: ReadonlyMap<string, ReadonlyMap<string, readonly KalendariumEntry[]>>;

  constructor(
    tables: ReadonlyMap<string, ReadonlyMap<string, readonly KalendariumEntry[]>>
  ) {
    this.tables = tables;
  }

  get(kalendar: string): ReadonlyMap<string, readonly KalendariumEntry[]> | undefined {
    return this.tables.get(kalendar);
  }

  get size(): number {
    return this.tables.size;
  }
}

export function buildKalendariumTable(
  tables: readonly NamedKalendariumEntries[]
): KalendariumTable {
  const grouped = new Map<string, ReadonlyMap<string, readonly KalendariumEntry[]>>();

  for (const table of tables) {
    if (grouped.has(table.name)) {
      continue;
    }

    const byDate = new Map<string, KalendariumEntry[]>();
    for (const entry of table.entries) {
      const bucket = byDate.get(entry.dateKey);
      if (bucket) {
        bucket.push(entry);
      } else {
        byDate.set(entry.dateKey, [entry]);
      }
    }

    grouped.set(table.name, byDate);
  }

  return new InMemoryKalendariumTable(grouped);
}
