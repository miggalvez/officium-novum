import {
  MISSA_ALIAS_HINTS,
  MISSA_ONLY_HANDLES,
  VERSION_POLICY,
  asVersionHandle,
  type PolicyName,
  type VersionDescriptor,
  type VersionHandle,
  type VersionRegistry
} from '@officium-novum/rubrical-engine';

export type VersionSupportStatus = 'supported' | 'deferred' | 'missa-only';

export interface ApiVersionEntry {
  readonly handle: VersionHandle;
  readonly status: VersionSupportStatus;
  readonly descriptor?: VersionDescriptor;
  readonly policyName?: PolicyName;
  readonly aliases: readonly string[];
  readonly hint?: VersionHandle;
}

export interface VersionInfoDto {
  readonly handle: VersionHandle;
  readonly status: VersionSupportStatus;
  readonly policyName?: PolicyName;
  readonly kalendar?: string;
  readonly transfer?: string;
  readonly stransfer?: string;
  readonly base?: VersionHandle;
  readonly transferBase?: VersionHandle;
  readonly aliases: readonly string[];
  readonly hint?: VersionHandle;
}

export const DEFAULT_VERSION_HANDLE = asVersionHandle('Rubrics 1960 - 1960');

export const RUBRICS_ALIASES: Readonly<Record<string, VersionHandle>> = {
  '1911': asVersionHandle('Divino Afflatu - 1954'),
  '1955': asVersionHandle('Reduced - 1955'),
  '1960': DEFAULT_VERSION_HANDLE
};

const SUPPORTED_OFFICE_HANDLES = new Set<VersionHandle>([
  asVersionHandle('Divino Afflatu - 1939'),
  asVersionHandle('Divino Afflatu - 1954'),
  asVersionHandle('Reduced - 1955'),
  DEFAULT_VERSION_HANDLE,
  asVersionHandle('Rubrics 1960 - 2020 USA')
]);

const DEFERRED_OFFICE_HANDLES = new Set<VersionHandle>([
  asVersionHandle('Tridentine - 1570'),
  asVersionHandle('Tridentine - 1888'),
  asVersionHandle('Tridentine - 1906'),
  asVersionHandle('Monastic Tridentinum 1617'),
  asVersionHandle('Monastic Divino 1930'),
  asVersionHandle('Monastic - 1963'),
  asVersionHandle('Monastic - 1963 - Barroux'),
  asVersionHandle('Monastic Tridentinum Cisterciensis 1951'),
  asVersionHandle('Monastic Tridentinum Cisterciensis Altovadensis'),
  asVersionHandle('Ordo Praedicatorum - 1962')
]);

export function buildApiVersionRegistry(input: {
  readonly versionRegistry: VersionRegistry;
}): ReadonlyMap<string, ApiVersionEntry> {
  const entries = new Map<string, ApiVersionEntry>();
  addSupportedVersions(entries, input.versionRegistry);
  addDeferredVersions(entries, input.versionRegistry);
  addMissaOnlyVersions(entries);
  return entries;
}

export function toVersionInfoDto(entry: ApiVersionEntry): VersionInfoDto {
  return {
    handle: entry.handle,
    status: entry.status,
    ...(entry.policyName ? { policyName: entry.policyName } : {}),
    ...(entry.descriptor
      ? {
          kalendar: entry.descriptor.kalendar,
          transfer: entry.descriptor.transfer,
          stransfer: entry.descriptor.stransfer,
          ...(entry.descriptor.base ? { base: entry.descriptor.base } : {}),
          ...(entry.descriptor.transferBase
            ? { transferBase: entry.descriptor.transferBase }
            : {})
        }
      : {}),
    aliases: entry.aliases,
    ...(entry.hint ? { hint: entry.hint } : {})
  };
}

function aliasesFor(handle: VersionHandle): readonly string[] {
  return Object.entries(RUBRICS_ALIASES)
    .filter(([, target]) => target === handle)
    .map(([alias]) => alias);
}

function addSupportedVersions(
  entries: Map<string, ApiVersionEntry>,
  versionRegistry: VersionRegistry
): void {
  for (const handle of SUPPORTED_OFFICE_HANDLES) {
    const row = versionRegistry.get(handle);
    const policy = VERSION_POLICY.get(handle);
    if (!row || !policy) {
      continue;
    }
    entries.set(handle, {
      handle,
      status: 'supported',
      policyName: policy.name,
      descriptor: {
        handle,
        kalendar: row.kalendar,
        transfer: row.transfer,
        stransfer: row.stransfer,
        ...(row.base ? { base: row.base } : {}),
        ...(row.transferBase ? { transferBase: row.transferBase } : {}),
        policyName: policy.name
      },
      aliases: aliasesFor(handle)
    });
  }
}

function addDeferredVersions(
  entries: Map<string, ApiVersionEntry>,
  versionRegistry: VersionRegistry
): void {
  for (const handle of DEFERRED_OFFICE_HANDLES) {
    const row = versionRegistry.get(handle);
    const policy = VERSION_POLICY.get(handle);
    entries.set(handle, {
      handle,
      status: 'deferred',
      ...(policy ? { policyName: policy.name } : {}),
      ...(row && policy
        ? {
            descriptor: {
              handle,
              kalendar: row.kalendar,
              transfer: row.transfer,
              stransfer: row.stransfer,
              ...(row.base ? { base: row.base } : {}),
              ...(row.transferBase ? { transferBase: row.transferBase } : {}),
              policyName: policy.name
            }
          }
        : {}),
      aliases: aliasesFor(handle)
    });
  }
}

function addMissaOnlyVersions(entries: Map<string, ApiVersionEntry>): void {
  for (const [handle, hint] of MISSA_ALIAS_HINTS.entries()) {
    entries.set(handle, {
      handle,
      status: 'missa-only',
      aliases: [],
      hint
    });
  }

  for (const handle of MISSA_ONLY_HANDLES) {
    entries.set(handle, {
      handle,
      status: 'missa-only',
      aliases: []
    });
  }
}
