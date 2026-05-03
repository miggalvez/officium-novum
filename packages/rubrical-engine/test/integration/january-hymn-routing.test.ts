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
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine,
  type HourName,
  type RubricalEngine,
  type SlotContent
} from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');

const describeIfUpstream = existsSync(UPSTREAM_ROOT) ? describe : describe.skip;

describeIfUpstream('January hymn routing regressions', () => {
  it(
    'attaches doxology variants only to the 1955 fallback hymns that need them',
    async () => {
      const engines = await loadEngines([
        'Reduced - 1955',
        'Rubrics 1960 - 1960'
      ]);

      const reduced = engines.get('Reduced - 1955');
      const roman1960 = engines.get('Rubrics 1960 - 1960');
      expect(reduced).toBeDefined();
      expect(roman1960).toBeDefined();
      if (!reduced || !roman1960) {
        return;
      }

      for (const [date, variant] of [
        ['2024-01-01', 'horas/Latin/Psalterium/Doxologies:Nat'],
        ['2024-01-06', 'horas/Latin/Psalterium/Doxologies:Epi'],
        ['2024-01-13', 'horas/Latin/Psalterium/Doxologies:Epi']
      ] as const) {
        expectMinorHourHymn(reduced, date, 'prime', 'horas/Latin/Psalterium/Special/Prima Special:Hymnus Prima');
        expectMinorHourDoxology(reduced, date, 'prime', variant);
        expectMinorHourHymn(reduced, date, 'terce', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Tertia');
        expectMinorHourDoxology(reduced, date, 'terce', variant);
        expectMinorHourHymn(reduced, date, 'sext', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Sexta');
        expectMinorHourDoxology(reduced, date, 'sext', variant);
        expectMinorHourHymn(reduced, date, 'none', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Nona');
        expectMinorHourDoxology(reduced, date, 'none', variant);
      }

      // Holy Family keeps the fallback minor-hour hymns, but supplies its own
      // office-specific doxology stanza instead of the generic Epiphany block.
      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        expectMinorHourDoxology(reduced, '2024-01-07', hour, 'horas/Latin/Tempora/Epi1-0:Doxology');
      }

      // 1960 keeps the same January doxology selectors on fallback minor-hour
      // hymns; the rules still carry `Doxology=Nat/Epi`, and Holy Family
      // still owns its local `[Doxology]` stanza.
      for (const [date, variant] of [
        ['2024-01-01', 'horas/Latin/Psalterium/Doxologies:Nat'],
        ['2024-01-06', 'horas/Latin/Psalterium/Doxologies:Epi'],
        ['2024-01-13', 'horas/Latin/Psalterium/Doxologies:Epi']
      ] as const) {
        expectMinorHourHymn(roman1960, date, 'prime', 'horas/Latin/Psalterium/Special/Prima Special:Hymnus Prima');
        expectMinorHourDoxology(roman1960, date, 'prime', variant);
        expectMinorHourHymn(roman1960, date, 'terce', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Tertia');
        expectMinorHourDoxology(roman1960, date, 'terce', variant);
        expectMinorHourHymn(roman1960, date, 'sext', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Sexta');
        expectMinorHourDoxology(roman1960, date, 'sext', variant);
        expectMinorHourHymn(roman1960, date, 'none', 'horas/Latin/Psalterium/Special/Minor Special:Hymnus Nona');
        expectMinorHourDoxology(roman1960, date, 'none', variant);
      }

      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        expectMinorHourDoxology(roman1960, '2024-01-07', hour, 'horas/Latin/Tempora/Epi1-0:Doxology');
      }

      // Non-January controls: ordinary dates should not sprout a doxology
      // slot just because the hymn fell back to Prima/Minor Special.
      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        expectNoDoxologyVariant(reduced, '2024-02-11', hour);
      }
      expectNoDoxologyVariant(reduced, '2024-02-18', 'prime');
      expectNoDoxologyVariant(roman1960, '2024-02-18', 'prime');
      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        expectNoDoxologyVariant(roman1960, '2026-05-01', hour);
        expectNoDoxologyVariant(roman1960, '2026-05-03', hour);
      }

      expectMinorHourHymn(
        reduced,
        '2024-05-19',
        'terce',
        'horas/Latin/Psalterium/Special/Minor Special:Hymnus Pasc7 Tertia'
      );
      expectMinorHourHymn(
        roman1960,
        '2024-05-19',
        'terce',
        'horas/Latin/Psalterium/Special/Minor Special:Hymnus Pasc7 Tertia'
      );
      expectMinorHourDoxology(
        reduced,
        '2024-05-19',
        'terce',
        'horas/Latin/Psalterium/Doxologies:Pent'
      );
      expectMinorHourDoxology(
        roman1960,
        '2024-05-19',
        'terce',
        'horas/Latin/Psalterium/Doxologies:Pent'
      );
    },
    240_000
  );
});

let enginesPromise: Promise<ReadonlyMap<string, RubricalEngine>> | undefined;

async function loadEngines(
  handles: readonly string[]
): Promise<ReadonlyMap<string, RubricalEngine>> {
  if (!enginesPromise) {
    enginesPromise = (async () => {
      const corpus = await loadCorpus(UPSTREAM_ROOT, {
        resolveReferences: false
      });
      const versionRegistry = buildVersionRegistry(
        parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
      );
      const kalendarium = buildKalendariumTable(loadKalendaria());
      const yearTransfers = buildYearTransferTable(loadTransferTables());
      const scriptureTransfers = buildScriptureTransferTable(loadScriptureTransferTables());

      return new Map(
        [
          'Reduced - 1955',
          'Rubrics 1960 - 1960'
        ].map((handle) => [
          handle,
          createRubricalEngine({
            corpus: corpus.index,
            kalendarium,
            yearTransfers,
            scriptureTransfers,
            versionRegistry,
            version: asVersionHandle(handle),
            policyMap: VERSION_POLICY
          })
        ])
      );
    })();
  }

  const engines = await enginesPromise;
  return new Map(handles.map((handle) => [handle, engines.get(handle)!]));
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

function expectMinorHourHymn(
  engine: RubricalEngine,
  date: string,
  hour: 'prime' | 'terce' | 'sext' | 'none',
  expected: string
) {
  expect(formatSingleRef(slotAt(engine, date, hour, 'hymn'))).toBe(expected);
}

function expectMinorHourDoxology(
  engine: RubricalEngine,
  date: string,
  hour: 'prime' | 'terce' | 'sext' | 'none',
  expected: string
) {
  expect(formatSingleRef(slotAt(engine, date, hour, 'doxology-variant'))).toBe(expected);
}

function expectNoDoxologyVariant(
  engine: RubricalEngine,
  date: string,
  hour: HourName
) {
  expect(engine.resolveDayOfficeSummary(date).hours[hour]?.slots['doxology-variant']).toBeUndefined();
}

function slotAt(
  engine: RubricalEngine,
  date: string,
  hour: HourName,
  slotName: 'hymn' | 'doxology-variant'
): SlotContent | undefined {
  return engine.resolveDayOfficeSummary(date).hours[hour]?.slots[slotName];
}

function formatSingleRef(slot: SlotContent | undefined): string | undefined {
  expect(slot?.kind).toBe('single-ref');
  if (!slot || slot.kind !== 'single-ref') {
    return undefined;
  }
  return `${slot.ref.path}:${slot.ref.section}`;
}
