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
  type RubricalEngine,
  type YearTransferTable
} from '../../src/index.js';

interface TransferFixtureRow {
  readonly feastPath: string;
  readonly fromDate: string;
  readonly outcome: 'not-impeded' | 'transferred' | 'perpetually-impeded';
  readonly target?: string;
}

interface TransferFixtureFile {
  readonly year: number;
  readonly transfers: readonly TransferFixtureRow[];
}

interface UpstreamResources {
  readonly corpus: Awaited<ReturnType<typeof loadCorpus>>;
  readonly versionRegistry: ReturnType<typeof buildVersionRegistry>;
  readonly kalendarium: ReturnType<typeof buildKalendariumTable>;
  readonly defaultYearTransfers: YearTransferTable;
  readonly scriptureTransfers: ReturnType<typeof buildScriptureTransferTable>;
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

let resourcesPromise: Promise<UpstreamResources> | null = null;

describeIfUpstream('Phase 2e upstream transfer and vigil matrix', () => {
  it('matches transfer fixtures for Annunciation/St Joseph across five years', async () => {
    const engine = await createUpstreamEngine();
    const fixtures = loadTransferFixtures();

    for (const fixture of fixtures) {
      for (const expected of fixture.transfers) {
        const found = findTransferredCelebration(engine, expected.feastPath, expected.fromDate, 60);
        const fromDateSummary = engine.resolveDayOfficeSummary(expected.fromDate);

        switch (expected.outcome) {
          case 'not-impeded':
            expect(found, `${expected.feastPath} ${expected.fromDate} should not transfer`).toBeUndefined();
            expect(
              hasTransferRejectionWarning(
                fromDateSummary.warnings,
                expected.feastPath,
                expected.fromDate
              ),
              `${expected.feastPath} ${expected.fromDate} should not be marked perpetually impeded`
            ).toBe(false);
            continue;
          case 'transferred':
            expect(expected.target).toBeDefined();
            expect(found?.date).toBe(expected.target);
            expect(found?.summary.celebration.transferredFrom).toBe(expected.fromDate);
            continue;
          case 'perpetually-impeded':
            expect(found, `${expected.feastPath} ${expected.fromDate} should not transfer`).toBeUndefined();
            expect(
              hasTransferRejectionWarning(
                fromDateSummary.warnings,
                expected.feastPath,
                expected.fromDate
              ),
              `${expected.feastPath} ${expected.fromDate} should be marked perpetually impeded`
            ).toBe(true);
            continue;
        }
      }
    }
  }, 240_000);

  it('keeps leap-year St Matthias as a sanctoral remap (not a transfer)', async () => {
    const engine = await createUpstreamEngine();
    const summary = engine.resolveDayOfficeSummary('2024-02-25');
    const matthiasCandidates = summary.candidates.filter(
      (candidate) => candidate.feastRef.path === 'Sancti/02-24'
    );

    expect(matthiasCandidates.some((candidate) => candidate.source === 'sanctoral')).toBe(true);
    expect(matthiasCandidates.some((candidate) => candidate.source === 'transferred-in')).toBe(false);
  }, 240_000);

  it('celebrates the Vigil of Christmas with vigil metadata when Dec 24 is a Sunday', async () => {
    const engine = await createUpstreamEngine();
    const summary = engine.resolveDayOfficeSummary('2023-12-24');

    expect(summary.celebration.feastRef.path.startsWith('Sancti/12-24')).toBe(true);
    expect(summary.celebration.vigil?.path).toBe('Sancti/12-25');
    expect(summary.commemorations.map((entry) => entry.feastRef.path)).toContain('Tempora/Adv4-0');
  }, 240_000);

  it('emits transfer-table-overrides-rule warnings when overlay target disagrees with computed target', async () => {
    const customTransfers = buildYearTransferTable([
      {
        yearKey: '331',
        entries: parseTransfer('04-20=03-25;;1960\n')
      }
    ]);
    const engine = await createUpstreamEngine(customTransfers);
    const summary = engine.resolveDayOfficeSummary('2024-03-25');

    const warning = summary.warnings.find((entry) => entry.code === 'transfer-table-overrides-rule');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warn');
    expect(warning?.context).toMatchObject({
      feast: 'Sancti/03-25',
      fromDate: '2024-03-25',
      overlayTarget: '2024-04-20'
    });
  }, 240_000);
});

function loadTransferFixtures(): readonly TransferFixtureFile[] {
  const fixtureDir = resolve(TEST_DIR, '../fixtures');
  return readdirSync(fixtureDir)
    .filter((name) => /^transfers-1960-\d{4}\.json$/u.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => JSON.parse(readFileSync(resolve(fixtureDir, name), 'utf8')) as TransferFixtureFile);
}

function findTransferredCelebration(
  engine: RubricalEngine,
  feastPath: string,
  fromDate: string,
  maxDays: number
): { readonly date: string; readonly summary: ReturnType<RubricalEngine['resolveDayOfficeSummary']> } | undefined {
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const date = addDaysIso(fromDate, offset);
    let summary: ReturnType<RubricalEngine['resolveDayOfficeSummary']>;
    try {
      summary = engine.resolveDayOfficeSummary(date);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('Corpus file not found for office path: Tempora/') ||
          error.message.startsWith('Corpus file not found for office path: Sancti/') ||
          error.message.startsWith('No matching [Rank] line found in horas/Latin/Sancti/'))
      ) {
        continue;
      }
      throw error;
    }
    if (
      summary.celebration.feastRef.path === feastPath &&
      summary.celebration.transferredFrom === fromDate
    ) {
      return { date, summary };
    }
  }
  return undefined;
}

function hasTransferRejectionWarning(
  warnings: readonly { readonly code: string; readonly context?: Readonly<Record<string, string>> }[],
  feastPath: string,
  fromDate: string
): boolean {
  return warnings.some((warning) => {
    if (
      warning.code !== 'transfer-perpetually-impeded' &&
      warning.code !== 'transfer-bounded-search-exceeded'
    ) {
      return false;
    }
    return warning.context?.feast === feastPath && warning.context?.fromDate === fromDate;
  });
}

function addDaysIso(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
}

async function createUpstreamEngine(yearTransfers?: YearTransferTable): Promise<RubricalEngine> {
  const resources = await loadUpstreamResources();
  return createRubricalEngine({
    corpus: resources.corpus.index,
    kalendarium: resources.kalendarium,
    yearTransfers: yearTransfers ?? resources.defaultYearTransfers,
    scriptureTransfers: resources.scriptureTransfers,
    versionRegistry: resources.versionRegistry,
    version: asVersionHandle('Rubrics 1960 - 1960'),
    policyMap: VERSION_POLICY
  });
}

async function loadUpstreamResources(): Promise<UpstreamResources> {
  if (resourcesPromise) {
    return resourcesPromise;
  }

  resourcesPromise = (async () => {
    const corpus = await loadCorpus(UPSTREAM_ROOT, {
      resolveReferences: false
    });
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const kalendarium = buildKalendariumTable(loadKalendaria());
    const defaultYearTransfers = buildYearTransferTable(loadTransferTables());
    const scriptureTransfers = buildScriptureTransferTable(loadScriptureTransferTables());

    return {
      corpus,
      versionRegistry,
      kalendarium,
      defaultYearTransfers,
      scriptureTransfers
    };
  })();

  return resourcesPromise;
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
