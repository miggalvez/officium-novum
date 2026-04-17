import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadCorpus,
  parseKalendarium,
  parseScriptureTransfer,
  parseTransfer,
  parseVersionRegistry
} from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine
} from '../../src/index.js';

interface FixtureDate {
  readonly date: string;
  readonly winner: 'today' | 'tomorrow';
  readonly sourcePath: string;
  readonly commemorations: readonly string[];
  readonly complineSourceKind: 'vespers-winner' | 'ordinary' | 'triduum-special';
}

interface FixturePayload {
  readonly year: number;
  readonly version: string;
  readonly dates: readonly FixtureDate[];
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const FIXTURE_PATH = resolve(TEST_DIR, '../fixtures/vespers-1960-2024.json');
const HAS_FIXTURE = existsSync(FIXTURE_PATH);
const describeIfReady = HAS_UPSTREAM && HAS_FIXTURE ? describe : describe.skip;

describeIfReady('Phase 2f 1960 concurrence/compline against focused upstream matrix', () => {
  it('matches concurrence winner/source/commemorations and Compline source kind', async () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixturePayload;
    const corpus = await loadCorpus(UPSTREAM_ROOT, {
      resolveReferences: false
    });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: corpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle(fixture.version),
      policyMap: VERSION_POLICY
    });

    for (const row of fixture.dates) {
      const summary = engine.resolveDayOfficeSummary(row.date);
      expect(summary.concurrence.winner).toBe(row.winner);
      expect(summary.concurrence.source.feastRef.path).toBe(row.sourcePath);
      expect(summary.concurrence.commemorations.map((entry) => entry.feastRef.path)).toEqual(
        row.commemorations
      );
      expect(summary.compline.source.kind).toBe(row.complineSourceKind);
    }
  }, 240_000);
});

function loadKalendaria() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Kalendaria');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name: name.slice(0, -4),
      entries: parseKalendarium(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function loadTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Transfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}

function loadScriptureTransferTables() {
  const dir = resolve(UPSTREAM_ROOT, 'Tabulae/Stransfer');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      yearKey: name.slice(0, -4),
      entries: parseScriptureTransfer(readFileSync(resolve(dir, name), 'utf8'))
    }));
}
