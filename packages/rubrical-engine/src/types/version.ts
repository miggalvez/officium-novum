import type { RubricalPolicy, PolicyName } from './policy.js';

/**
 * A DO version string exactly as it appears in the `version` column of
 * `Tabulae/data.txt`.
 *
 * Branded to prevent accidental mixing with ordinary strings. Use
 * {@link asVersionHandle} to lift a `string` into this type; the engine
 * validates handles against the registry at resolution time.
 */
export type VersionHandle = string & { readonly __brand: 'VersionHandle' };

/** Lift a string into {@link VersionHandle}. Validation happens at resolution. */
export function asVersionHandle(value: string): VersionHandle {
  return value as VersionHandle;
}

/**
 * Fully resolved version: identity plus the three table names from
 * `data.txt`, the inheritance chain, and the bound {@link RubricalPolicy}.
 *
 * This is the internal form held by a running engine. It carries a live
 * policy object and is not serialization-safe. For public output use
 * {@link VersionDescriptor}.
 */
export interface ResolvedVersion {
  readonly handle: VersionHandle;
  /** The `Kalendaria/<name>.txt` key. */
  readonly kalendar: string;
  /** The `Tabulae/Transfer/<name>.txt` key. */
  readonly transfer: string;
  /** The `Tabulae/Stransfer/<name>.txt` key. */
  readonly stransfer: string;
  /** Parent version for Kalendaria inheritance, if any. */
  readonly base?: VersionHandle;
  /** Parent version for Transfer/Stransfer inheritance, if any. */
  readonly transferBase?: VersionHandle;
  readonly policy: RubricalPolicy;
}

/**
 * Serialization-safe projection of {@link ResolvedVersion}.
 *
 * Carries the same identity and table names, but exposes the policy only
 * by its {@link PolicyName}. Used on {@link OrdoEntry} and API responses so
 * the output contract doesn't leak live policy objects across process
 * boundaries.
 */
export interface VersionDescriptor {
  readonly handle: VersionHandle;
  readonly kalendar: string;
  readonly transfer: string;
  readonly stransfer: string;
  readonly base?: VersionHandle;
  readonly transferBase?: VersionHandle;
  readonly policyName: PolicyName;
}

/**
 * Immutable lookup from {@link VersionHandle} to its raw `data.txt` row.
 *
 * Construct with {@link buildVersionRegistry} from the parser's
 * `parseVersionRegistry` output.
 */
export type VersionRegistry = ReadonlyMap<VersionHandle, VersionRegistryRow>;

/**
 * Normalized row from `data.txt`. Mirrors the parser's `VersionDefinition`
 * but with `version` replaced by a branded {@link VersionHandle}.
 */
export interface VersionRegistryRow {
  readonly handle: VersionHandle;
  readonly kalendar: string;
  readonly transfer: string;
  readonly stransfer: string;
  readonly base?: VersionHandle;
  readonly transferBase?: VersionHandle;
}
