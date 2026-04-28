import {
  MISSA_ALIAS_HINTS,
  MISSA_ONLY_HANDLES,
  VERSION_POLICY,
  asVersionHandle,
  createRubricalEngine,
  describeVersion,
  type KalendariumTable,
  type OfficeTextIndex,
  type PolicyName,
  type RubricalEngine,
  type ScriptureTransferTable,
  type VersionDescriptor,
  type VersionHandle,
  type VersionRegistry,
  type YearTransferTable
} from '@officium-novum/rubrical-engine';

import { ApiError } from './errors.js';

export type VersionSupportStatus = 'supported' | 'deferred' | 'missa-only';

export interface ApiVersionEntry {
  readonly handle: VersionHandle;
  readonly status: VersionSupportStatus;
  readonly descriptor?: VersionDescriptor;
  readonly policyName?: PolicyName;
  readonly aliases: readonly string[];
  readonly hint?: VersionHandle;
  readonly engine?: RubricalEngine;
}

export interface ApiVersionEngineResources {
  readonly corpus: OfficeTextIndex;
  readonly kalendarium: KalendariumTable;
  readonly yearTransfers: YearTransferTable;
  readonly scriptureTransfers: ScriptureTransferTable;
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
  readonly engineResources?: ApiVersionEngineResources;
}): ReadonlyMap<string, ApiVersionEntry> {
  const entries = new Map<string, ApiVersionEntry>();
  addSupportedVersions(entries, input.versionRegistry, input.engineResources);
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
  versionRegistry: VersionRegistry,
  engineResources: ApiVersionEngineResources | undefined
): void {
  for (const handle of SUPPORTED_OFFICE_HANDLES) {
    const row = versionRegistry.get(handle);
    const policy = VERSION_POLICY.get(handle);
    if (!row || !policy) {
      continue;
    }
    const engine = engineResources
      ? createRubricalEngine({
          corpus: engineResources.corpus,
          kalendarium: engineResources.kalendarium,
          yearTransfers: engineResources.yearTransfers,
          scriptureTransfers: engineResources.scriptureTransfers,
          versionRegistry,
          version: handle,
          policyMap: VERSION_POLICY
        })
      : undefined;
    entries.set(handle, {
      handle,
      status: 'supported',
      policyName: engine?.version.policy.name ?? policy.name,
      descriptor: engine
        ? describeVersion(engine.version)
        : {
            handle,
            kalendar: row.kalendar,
            transfer: row.transfer,
            stransfer: row.stransfer,
            ...(row.base ? { base: row.base } : {}),
            ...(row.transferBase ? { transferBase: row.transferBase } : {}),
            policyName: policy.name
          },
      aliases: aliasesFor(handle),
      ...(engine ? { engine } : {})
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

export function resolveApiVersion(input: {
  readonly version?: string;
  readonly rubrics?: string;
  readonly versions: ReadonlyMap<string, ApiVersionEntry>;
}): ApiVersionEntry {
  if (input.version) {
    const entry = input.versions.get(input.version);
    if (entry) {
      return entry;
    }
    throw new ApiError({
      statusCode: 400,
      code: 'unknown-version',
      message: `Unknown version: ${input.version}`,
      details: { version: input.version }
    });
  }

  if (input.rubrics) {
    const handle = RUBRICS_ALIASES[input.rubrics];
    if (!handle) {
      throw new ApiError({
        statusCode: 400,
        code: 'unknown-version',
        message: `Unknown rubrics alias: ${input.rubrics}`,
        details: { rubrics: input.rubrics }
      });
    }
    const entry = input.versions.get(handle);
    if (entry) {
      return entry;
    }
    throw new ApiError({
      statusCode: 400,
      code: 'unknown-version',
      message: `Unknown version: ${handle}`,
      details: { version: handle }
    });
  }

  throw new ApiError({
    statusCode: 400,
    code: 'missing-version',
    message: 'A version query parameter is required.'
  });
}

export function assertVersionServable(entry: ApiVersionEntry): asserts entry is ApiVersionEntry & {
  readonly descriptor: VersionDescriptor;
  readonly engine: RubricalEngine;
} {
  if (entry.status === 'deferred') {
    throw new ApiError({
      statusCode: 501,
      code: 'unsupported-version',
      message: 'This Breviary version is known but its rubrical policy is deferred in the current API.',
      details: { version: entry.handle }
    });
  }

  if (entry.status === 'missa-only') {
    throw new ApiError({
      statusCode: 422,
      code: 'missa-only-version',
      message: 'This version identifier belongs to the Mass-side table, not the Breviary Office API.',
      details: { version: entry.handle },
      ...(entry.hint ? { hints: [`Use "${entry.hint}" for the Breviary.`] } : {})
    });
  }

  if (!entry.descriptor || !entry.engine) {
    throw new ApiError({
      statusCode: 500,
      code: 'internal-error',
      message: `Version is supported but has no initialized engine: ${entry.handle}`
    });
  }
}
