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
  createRubricalEngine,
  type HourDirective,
  type HourName
} from '../../src/index.js';

interface FixtureDate {
  readonly date: string;
  readonly expectedHours: readonly HourName[];
  readonly laudsDirectives: readonly HourDirective[];
  readonly vespersDirectives: readonly HourDirective[];
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
const FIXTURE_PATH = resolve(TEST_DIR, '../fixtures/hours-1960-2024.json');
const HAS_FIXTURE = existsSync(FIXTURE_PATH);
const describeIfReady = HAS_UPSTREAM && HAS_FIXTURE ? describe : describe.skip;

const PHASE_2G_HOURS: readonly HourName[] = [
  'matins',
  'lauds',
  'prime',
  'terce',
  'sext',
  'none',
  'vespers',
  'compline'
];

describeIfReady('Phase 2g Hour structuring against upstream 1960 corpus', () => {
  it('populates structured Hours and emits expected directive flags', async () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixturePayload;
    const corpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
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
      const presentHours = Object.keys(summary.hours).sort();
      expect(presentHours).toEqual([...row.expectedHours].sort());

      // Every Hour must have a typed slot inventory, never `any`-shaped.
      for (const hour of PHASE_2G_HOURS) {
        const structure = summary.hours[hour];
        expect(structure).toBeDefined();
        expect(structure?.hour).toBe(hour);
        expect(structure?.slots).toBeDefined();
      }

      // Compline stays backward-compatible on `summary.compline`.
      expect(summary.compline.hour).toBe('compline');

      const laudsDirectives = summary.hours.lauds?.directives ?? [];
      for (const directive of row.laudsDirectives) {
        expect(laudsDirectives).toContain(directive);
      }

      const vespersDirectives = summary.hours.vespers?.directives ?? [];
      for (const directive of row.vespersDirectives) {
        expect(vespersDirectives).toContain(directive);
      }

      // Codex P1 #1 regression: combined Ordinarium headings (`#Capitulum
      // Hymnus Versus`) must expand into hymn + versicle slots.
      const lauds = summary.hours.lauds;
      expect(lauds?.slots.hymn).toBeDefined();
      expect(lauds?.slots.versicle).toBeDefined();
      const vespers = summary.hours.vespers;
      expect(vespers?.slots.hymn).toBeDefined();
      expect(vespers?.slots.versicle).toBeDefined();
    }
  }, 240_000);

  it('Codex P1 #2: Sunday Lauds uses temporal [Ant 2] / [Versum 2] for the proper', async () => {
    const corpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: corpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    // A post-Pentecost Sunday; the exact Pent index depends on the year's
    // Easter but the Ant 2 / Versum 2 lookup behavior is uniform.
    const summary = engine.resolveDayOfficeSummary('2024-06-16');
    expect(summary.temporal.dayOfWeek).toBe(0);
    const benedictus = summary.hours.lauds?.slots['antiphon-ad-benedictus'];
    expect(benedictus?.kind).toBe('single-ref');
    if (benedictus?.kind === 'single-ref') {
      expect(benedictus.ref.section).toBe('Ant 2');
      expect(benedictus.ref.path).toMatch(/^horas\/Latin\/Tempora\/Pent\d{2}-0$/u);
    }
  }, 240_000);

  it('Codex follow-up P1: Ordinarium heading rubrics suppress final-antiphon-bvm under 1960', async () => {
    const corpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: corpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-08-15');

    // Laudes.txt:61 — `#Antiphona finalis` is omitted under rubrica 196.
    const laudsFinal = summary.hours.lauds?.slots['final-antiphon-bvm'];
    expect(laudsFinal?.kind).toBe('empty');

    // Completorium.txt:44 — `#Preces Dominicales` is omitted under rubrica 196.
    const complinePreces = summary.hours.compline?.slots.preces;
    expect(complinePreces?.kind).toBe('empty');

    // Completorium.txt:68 — `#Antiphona finalis` is only omitted under
    // cisterciensis, so 1960 Compline DOES say the final Marian antiphon.
    // Assert the slot is still present (not empty) for 1960.
    const complineFinal = summary.hours.compline?.slots['final-antiphon-bvm'];
    expect(complineFinal?.kind).not.toBe('empty');
  }, 240_000);

  it('Codex P1 #4: Assumption (a Thursday feast with Psalmi Dominica) uses Day0 psalmody', async () => {
    const corpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: corpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-08-15');
    const laudsPsalmody = summary.hours.lauds?.slots.psalmody;
    expect(laudsPsalmody?.kind).toBe('psalmody');
    if (laudsPsalmody?.kind === 'psalmody') {
      expect(laudsPsalmody.psalms[0]?.psalmRef.section).toMatch(/^Day0 /u);
    }
    const vespersPsalmody = summary.hours.vespers?.slots.psalmody;
    expect(vespersPsalmody?.kind).toBe('psalmody');
    if (vespersPsalmody?.kind === 'psalmody') {
      expect(vespersPsalmody.psalms[0]?.psalmRef.section).toBe('Day0 Vespera');
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
