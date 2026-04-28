import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseVersionRegistry } from '@officium-novum/parser';
import {
  buildVersionRegistry,
  type HourName,
  type VersionRegistry
} from '@officium-novum/rubrical-engine';

import type { ApiConfig } from './config.js';
import {
  buildLanguageRegistry,
  type LanguageEntry,
  type PublicLanguageTag
} from './services/language-map.js';
import {
  buildApiVersionRegistry,
  DEFAULT_VERSION_HANDLE,
  type ApiVersionEntry
} from './services/version-registry.js';

export interface ApiContext {
  readonly contentVersion: string;
  readonly corpusFileCount?: number;
  readonly supportedHours: readonly HourName[];
  readonly defaultVersion: ApiVersionEntry;
  readonly versions: ReadonlyMap<string, ApiVersionEntry>;
  readonly languages: ReadonlyMap<PublicLanguageTag, LanguageEntry>;
}

export const SUPPORTED_HOURS: readonly HourName[] = [
  'matins',
  'lauds',
  'prime',
  'terce',
  'sext',
  'none',
  'vespers',
  'compline'
];

export async function buildApiContext(config: ApiConfig): Promise<ApiContext> {
  const versionRegistry =
    config.versionRegistry ?? (await loadVersionRegistry(config.corpusPath));
  const versions = buildApiVersionRegistry({ versionRegistry });
  const defaultVersion = versions.get(DEFAULT_VERSION_HANDLE);
  if (!defaultVersion || defaultVersion.status !== 'supported') {
    throw new Error(`Default API version is not available: ${DEFAULT_VERSION_HANDLE}`);
  }

  return {
    contentVersion: config.contentVersion,
    supportedHours: SUPPORTED_HOURS,
    defaultVersion,
    versions,
    languages: buildLanguageRegistry()
  };
}

async function loadVersionRegistry(corpusPath: string): Promise<VersionRegistry> {
  const dataPath = resolve(corpusPath, 'Tabulae/data.txt');
  const content = await readFile(dataPath, 'utf8');
  return buildVersionRegistry(parseVersionRegistry(content));
}
