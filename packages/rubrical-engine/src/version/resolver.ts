import type { RubricalPolicy } from '../types/policy.js';
import type {
  ResolvedVersion,
  VersionDescriptor,
  VersionHandle,
  VersionRegistry
} from '../types/version.js';

import { MISSA_ALIAS_HINTS, MISSA_ONLY_HANDLES } from './policy-map.js';

/**
 * Materialize a {@link ResolvedVersion} from a branded handle, a registry
 * derived from `data.txt`, and a policy map.
 *
 * Fails fast on unknown handle and on missing policy binding. Callers are
 * expected to do this once per engine instance (see design §5).
 *
 * Error messages are specialised for the common failure modes:
 *
 *   - Handle absent from registry → `Unknown version: …`
 *   - Handle in registry, no policy, but has a Breviary-side alias →
 *     `Version '…' is a Mass-only identifier; use '…' for the Breviary.`
 *   - Handle in registry, classified as Mass-only, no alias hint →
 *     `Version '…' is not supported by the Roman Breviary engine.`
 *   - Handle in registry, not classified as Mass-only, no policy binding →
 *     `No policy binding for version: …`
 *
 * The final message is the fallback for genuine Breviary handles that are
 * missing from the active policy map, whether because the caller supplied a
 * partial/custom map or because a new upstream Breviary row has not yet been
 * assigned a policy.
 *
 * @throws Error with one of the three message forms above.
 */
export function resolveVersion(
  handle: VersionHandle,
  registry: VersionRegistry,
  policyMap: ReadonlyMap<VersionHandle, RubricalPolicy>
): ResolvedVersion {
  const row = registry.get(handle);
  if (!row) {
    throw new Error(`Unknown version: ${handle}`);
  }
  const policy = policyMap.get(handle);
  if (!policy) {
    const hint = MISSA_ALIAS_HINTS.get(handle);
    if (hint) {
      throw new Error(
        `Version '${handle}' is a Mass-only identifier; use '${hint}' for the Breviary.`
      );
    }
    if (MISSA_ONLY_HANDLES.has(handle)) {
      throw new Error(
        `Version '${handle}' is not supported by the Roman Breviary engine.`
      );
    }
    throw new Error(`No policy binding for version: ${handle}`);
  }
  return {
    handle,
    kalendar: row.kalendar,
    transfer: row.transfer,
    stransfer: row.stransfer,
    ...(row.base ? { base: row.base } : {}),
    ...(row.transferBase ? { transferBase: row.transferBase } : {}),
    policy
  };
}

/**
 * Project a {@link ResolvedVersion} to its serialization-safe
 * {@link VersionDescriptor} form. The descriptor carries the policy's `name`
 * instead of the live policy object, making it safe to attach to output
 * surfaces (e.g. `OrdoEntry`) that cross process boundaries.
 */
export function describeVersion(version: ResolvedVersion): VersionDescriptor {
  return {
    handle: version.handle,
    kalendar: version.kalendar,
    transfer: version.transfer,
    stransfer: version.stransfer,
    ...(version.base ? { base: version.base } : {}),
    ...(version.transferBase ? { transferBase: version.transferBase } : {}),
    policyName: version.policy.name
  };
}
