import type { VersionDefinition } from '@officium-novum/parser';

import {
  asVersionHandle,
  type VersionHandle,
  type VersionRegistry,
  type VersionRegistryRow
} from '../types/version.js';

/**
 * Build an immutable {@link VersionRegistry} from the parser's flat
 * `VersionDefinition[]` output.
 *
 * - Brands each `version` string as a {@link VersionHandle}.
 * - Brands `base` / `transferBase` references likewise.
 * - Deduplicates by handle: if the same handle appears twice (as it does for
 *   `"Rubrics 1960 Newcalendar"` and other interim missa re-aliases), the
 *   first occurrence wins. `data.txt` puts the canonical (Breviary-first)
 *   entries ahead of the missa-only re-aliases, so first-wins matches the
 *   upstream expectation. This is documented in `data.txt`'s comment blocks.
 * - Does not validate that `base` / `transferBase` handles exist in the
 *   registry — a forward reference is conceivable and the resolver can
 *   surface that at resolution time if a caller actually walks the chain.
 */
export function buildVersionRegistry(
  definitions: readonly VersionDefinition[]
): VersionRegistry {
  const map = new Map<VersionHandle, VersionRegistryRow>();
  for (const def of definitions) {
    const handle = asVersionHandle(def.version);
    if (map.has(handle)) {
      continue;
    }
    const row: VersionRegistryRow = {
      handle,
      kalendar: def.kalendar,
      transfer: def.transfer,
      stransfer: def.stransfer,
      ...(def.base ? { base: asVersionHandle(def.base) } : {}),
      ...(def.transferBase ? { transferBase: asVersionHandle(def.transferBase) } : {})
    };
    map.set(handle, row);
  }
  return map;
}
