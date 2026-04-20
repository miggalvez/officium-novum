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
  type PsalmAssignment,
  type RubricalEngine
} from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');

const describeIfUpstream = existsSync(UPSTREAM_ROOT) ? describe : describe.skip;

describeIfUpstream('temporal Sunday minor-hour antiphon ownership', () => {
  it(
    'keeps explicit temporal Ant Prima/Tertia/Sexta/Nona sections on Quad Sundays while Prime uses the SQP psalm table',
    async () => {
      const engines = await loadEngines([
        'Reduced - 1955',
        'Rubrics 1960 - 1960'
      ]);

      for (const handle of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
        const engine = engines.get(handle);
        expect(engine, `${handle} engine`).toBeDefined();
        if (!engine) {
          continue;
        }

        for (const [date, officePath] of [
          ['2024-01-28', 'horas/Latin/Tempora/Quadp1-0'],
          ['2024-02-11', 'horas/Latin/Tempora/Quadp3-0']
        ] as const) {
          expectMinorHour(
            psalmodyAt(engine, date, 'prime'),
            `${officePath}:Ant Prima`,
            ['53', '92', '118(1-16)', '118(17-32)']
          );
          expectMinorHour(
            psalmodyAt(engine, date, 'terce'),
            `${officePath}:Ant Tertia`,
            ['118(33-48)', '118(49-64)', '118(65-80)']
          );
          expectMinorHour(
            psalmodyAt(engine, date, 'sext'),
            `${officePath}:Ant Sexta`,
            ['118(81-96)', '118(97-112)', '118(113-128)']
          );
          expectMinorHour(
            psalmodyAt(engine, date, 'none'),
            `${officePath}:Ant Nona`,
            ['118(129-144)', '118(145-160)', '118(161-176)']
          );
        }
      }
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

function psalmodyAt(
  engine: RubricalEngine,
  date: string,
  hour: 'prime' | 'terce' | 'sext' | 'none'
): readonly PsalmAssignment[] {
  const slot = engine.resolveDayOfficeSummary(date).hours[hour]?.slots.psalmody;
  expect(slot?.kind).toBe('psalmody');
  if (!slot || slot.kind !== 'psalmody') {
    return [];
  }
  return slot.psalms;
}

function expectMinorHour(
  psalms: readonly PsalmAssignment[],
  antiphonRef: string,
  selectors: readonly string[]
) {
  expect(psalms).toHaveLength(selectors.length);
  expect(
    psalms.map((entry) =>
      entry.antiphonRef
        ? `${entry.antiphonRef.path}:${entry.antiphonRef.section}${entry.antiphonRef.selector ? `:${entry.antiphonRef.selector}` : ''}`
        : '-'
    )
  ).toEqual([
    antiphonRef,
    ...Array.from({ length: selectors.length - 1 }, () => '-')
  ]);
  expect(psalms.map((entry) => entry.psalmRef.selector)).toEqual(selectors);
}
