import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadCorpus,
  parseKalendarium,
  parseScriptureTransfer,
  parseTransfer,
  parseVersionRegistry
} from '@officium-novum/parser';
import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine
} from '../../dist/index.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(THIS_DIR, '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const UPSTREAM_ROOT = resolve(REPO_ROOT, 'upstream/web/www');

const FIXTURES = [
  ['Divino Afflatu - 1954', 'divino-afflatu-2024.json'],
  ['Reduced - 1955', 'reduced-1955-2024.json']
];

if (!existsSync(UPSTREAM_ROOT)) {
  throw new Error(`Missing upstream corpus at ${UPSTREAM_ROOT}`);
}

const corpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
const versionRegistry = buildVersionRegistry(
  parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
);
const kalendarium = buildKalendariumTable(loadKalendaria());
const yearTransfers = buildYearTransferTable(loadTransferTables());
const scriptureTransfers = buildScriptureTransferTable(loadScriptureTransferTables());

let totalMismatches = 0;
for (const [handle, fixtureName] of FIXTURES) {
  const fixturePath = resolve(THIS_DIR, fixtureName);
  if (!existsSync(fixturePath)) {
    throw new Error(
      `Missing Perl fixture ${fixturePath}; run pnpm generate:phase-2h-perl-fixtures first.`
    );
  }

  const engine = createRubricalEngine({
    corpus: corpus.index,
    kalendarium,
    yearTransfers,
    scriptureTransfers,
    versionRegistry,
    version: asVersionHandle(handle),
    policyMap: VERSION_POLICY
  });
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const mismatches = [];
  for (const row of fixture.rows) {
    const summary = engine.resolveDayOfficeSummary(row.date);
    const actual = {
      celebrationPath: summary.celebration.feastRef.path,
      commemorations: summary.commemorations.map((entry) => entry.feastRef.path),
      concurrenceWinner: summary.concurrence.winner,
      concurrenceSourcePath: summary.concurrence.source.feastRef.path,
      complineSourceKind: summary.compline.source.kind,
      matinsTotalLessons:
        summary.hours.matins?.slots.psalmody?.kind === 'matins-nocturns'
          ? summary.hours.matins.slots.psalmody.nocturns.flatMap((entry) => entry.lessons).length
          : null
    };

    for (const key of Object.keys(actual)) {
      if (JSON.stringify(row[key]) !== JSON.stringify(actual[key])) {
        mismatches.push({
          date: row.date,
          field: key,
          expected: row[key],
          actual: actual[key]
        });
      }
    }
  }

  totalMismatches += mismatches.length;
  console.log(`${handle}: ${mismatches.length} mismatches across ${fixture.rows.length} dates`);
  for (const mismatch of mismatches.slice(0, 20)) {
    console.log(
      `  ${mismatch.date} ${mismatch.field}: expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(mismatch.actual)}`
    );
  }
}

if (totalMismatches > 0) {
  process.exitCode = 1;
}

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
