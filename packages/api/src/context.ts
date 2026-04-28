import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  loadCorpus,
  parseKalendarium,
  parseScriptureTransfer,
  parseTransfer,
  parseVersionRegistry,
  type TextIndex
} from '@officium-novum/parser';
import {
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
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
  readonly corpus?: TextIndex;
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
  const versionRegistry = config.versionRegistry ?? (await loadVersionRegistry(config.corpusPath));
  const runtime = config.versionRegistry
    ? undefined
    : await loadApiRuntime(config.corpusPath, versionRegistry);
  const versions = buildApiVersionRegistry({
    versionRegistry,
    ...(runtime
      ? {
          engineResources: {
            corpus: runtime.rawCorpus.index,
            kalendarium: runtime.kalendarium,
            yearTransfers: runtime.yearTransfers,
            scriptureTransfers: runtime.scriptureTransfers
          }
        }
      : {})
  });
  const defaultVersion = versions.get(DEFAULT_VERSION_HANDLE);
  if (!defaultVersion || defaultVersion.status !== 'supported') {
    throw new Error(`Default API version is not available: ${DEFAULT_VERSION_HANDLE}`);
  }

  return {
    contentVersion: config.contentVersion,
    ...(runtime ? { corpusFileCount: runtime.resolvedCorpus.fileCount } : {}),
    ...(runtime ? { corpus: runtime.resolvedCorpus.index } : {}),
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

async function loadApiRuntime(corpusPath: string, versionRegistry: VersionRegistry) {
  const [rawCorpus, resolvedCorpus, kalendaria, yearTransfers, scriptureTransfers] =
    await Promise.all([
      loadCorpus(corpusPath, { resolveReferences: false }),
      loadCorpus(corpusPath),
      loadKalendaria(corpusPath),
      loadTransferTables(corpusPath),
      loadScriptureTransferTables(corpusPath)
    ]);

  return {
    rawCorpus,
    resolvedCorpus,
    kalendarium: buildKalendariumTable(kalendaria),
    yearTransfers: buildYearTransferTable(yearTransfers),
    scriptureTransfers: buildScriptureTransferTable(scriptureTransfers)
  };
}

async function loadKalendaria(corpusPath: string) {
  const dir = resolve(corpusPath, 'Tabulae/Kalendaria');
  const names = await sortedTxtFiles(dir);
  return Promise.all(
    names.map(async (name) => ({
      name: name.slice(0, -4),
      entries: parseKalendarium(await readFile(resolve(dir, name), 'utf8'))
    }))
  );
}

async function loadTransferTables(corpusPath: string) {
  const dir = resolve(corpusPath, 'Tabulae/Transfer');
  const names = await sortedTxtFiles(dir);
  return Promise.all(
    names.map(async (name) => ({
      yearKey: name.slice(0, -4),
      entries: parseTransfer(await readFile(resolve(dir, name), 'utf8'))
    }))
  );
}

async function loadScriptureTransferTables(corpusPath: string) {
  const dir = resolve(corpusPath, 'Tabulae/Stransfer');
  const names = await sortedTxtFiles(dir);
  return Promise.all(
    names.map(async (name) => ({
      yearKey: name.slice(0, -4),
      entries: parseScriptureTransfer(await readFile(resolve(dir, name), 'utf8'))
    }))
  );
}

async function sortedTxtFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right));
}
