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

describeIfUpstream('January selection regressions', () => {
  it(
    'locks the January 1955/1960 psalm-antiphon slot refs',
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

      // Per docs/rubrical-sources.md, Roman 1955/1960 disputes are locked
      // against Ordo Recitandi and the governing rubrical books first, not
      // against Perl's rendered line stream. These assertions therefore pin
      // the Phase 2 source refs that the policies choose.

      // 1955-01-01: Christmas Octave retains proper Sanctoral antiphons at
      // Lauds and Vespers while using the festive Sunday psalm distribution.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:1',
        'horas/Latin/Sancti/01-01:Ant Laudes:2',
        'horas/Latin/Sancti/01-01:Ant Laudes:3',
        'horas/Latin/Sancti/01-01:Ant Laudes:4',
        'horas/Latin/Sancti/01-01:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Vespera:1',
        'horas/Latin/Sancti/01-01:Ant Vespera:2',
        'horas/Latin/Sancti/01-01:Ant Vespera:3',
        'horas/Latin/Sancti/01-01:Ant Vespera:4',
        'horas/Latin/Sancti/01-01:Ant Vespera:5'
      ]);

      // 1955-01-06 and 1955-01-13: Epiphany Vespers keeps five psalm slots;
      // only the fifth slot is replaced by the feast's Psalm 116 override.
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-06', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-13', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);

      // 1955-01-07: Holy Family Vespers takes its own temporal proper
      // antiphons from Epi1-0 rather than falling back to Epiphany's Sanctoral
      // antiphons.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-07', 'vespers')).toEqual([
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:1',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:2',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:3',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:4',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:5'
      ]);

      // 1960-01-06: Epiphany minor hours use the Sunday/festal `Tridentinum`
      // tables from Psalmi minor, while Lauds and Vespers keep Epiphany's
      // proper antiphons.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'prime'),
        'Prima Festis#antiphon',
        ['53', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'terce'),
        'Tertia Dominica#antiphon',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'sext'),
        'Sexta Dominica#antiphon',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'none'),
        'Nona Dominica#antiphon',
        ['118(129-144)', '118(145-160)', '118(161-176)']
      );
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-06', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        'horas/Latin/Sancti/01-06:Ant Laudes:4',
        'horas/Latin/Sancti/01-06:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-06', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Vespera:1',
        'horas/Latin/Sancti/01-06:Ant Vespera:2',
        'horas/Latin/Sancti/01-06:Ant Vespera:3',
        'horas/Latin/Sancti/01-06:Ant Vespera:4',
        'horas/Latin/Sancti/01-06:Ant Vespera:5'
      ]);

      // 1960-01-07: Holy Family keeps its temporal proper antiphons at Lauds
      // and Vespers, while the Sunday minor-hour psalm tables remain in force.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'prime'),
        'Prima Dominica#antiphon',
        ['53', '117', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'terce'),
        'Tertia Dominica#antiphon',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'sext'),
        'Sexta Dominica#antiphon',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'none'),
        'Nona Dominica#antiphon',
        ['118(129-144)', '118(145-160)', '118(161-176)']
      );
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-07', 'lauds')).toEqual([
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:1',
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:2',
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:3',
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:4',
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-07', 'vespers')).toEqual([
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:1',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:2',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:3',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:4',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera:5'
      ]);

      // 1960-01-13: the post-Epiphany Sunday keeps Epiphany's Lauds/Vespers
      // proper antiphons and the festal minor-hour Tridentinum tables.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'prime'),
        'Prima Festis#antiphon',
        ['53', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'terce'),
        'Tertia Dominica#antiphon',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'sext'),
        'Sexta Dominica#antiphon',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'none'),
        'Nona Dominica#antiphon',
        ['118(129-144)', '118(145-160)', '118(161-176)']
      );
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-13', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        'horas/Latin/Sancti/01-06:Ant Laudes:4',
        'horas/Latin/Sancti/01-06:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-13', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Vespera:1',
        'horas/Latin/Sancti/01-06:Ant Vespera:2',
        'horas/Latin/Sancti/01-06:Ant Vespera:3',
        'horas/Latin/Sancti/01-06:Ant Vespera:4',
        'horas/Latin/Sancti/01-06:Ant Vespera:5'
      ]);

      // 1960-01-14: ordinary Sunday after Epiphany continues to use the
      // Sunday Tridentinum minor-hour tables, including the split Psalm 118
      // ranges that used to flatten away.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'prime'),
        'Prima Dominica#antiphon',
        ['53', '117', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'terce'),
        'Tertia Dominica#antiphon',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'sext'),
        'Sexta Dominica#antiphon',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'none'),
        'Nona Dominica#antiphon',
        ['118(129-144)', '118(145-160)', '118(161-176)']
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

function psalmodyAt(
  engine: RubricalEngine,
  date: string,
  hour: 'lauds' | 'vespers' | 'prime' | 'terce' | 'sext' | 'none'
): readonly PsalmAssignment[] {
  const slot = engine.resolveDayOfficeSummary(date).hours[hour]?.slots.psalmody;
  expect(slot?.kind).toBe('psalmody');
  if (!slot || slot.kind !== 'psalmody') {
    return [];
  }
  return slot.psalms;
}

function expectAntiphonRefs(psalms: readonly PsalmAssignment[]) {
  return expect(
    psalms.map((entry) =>
      entry.antiphonRef
        ? `${entry.antiphonRef.path}:${entry.antiphonRef.section}:${entry.antiphonRef.selector ?? ''}`
        : '-'
    )
  );
}

function expectPsalmRefs(psalms: readonly PsalmAssignment[]) {
  return expect(
    psalms.map(
      (entry) =>
        `${entry.psalmRef.path}:${entry.psalmRef.section}${
          entry.psalmRef.selector ? `:${entry.psalmRef.selector}` : ''
        }`
    )
  );
}

function expectMinorHour(
  psalms: readonly PsalmAssignment[],
  antiphonSelector: string,
  selectors: readonly string[]
) {
  expect(psalms).toHaveLength(selectors.length);
  expectAntiphonRefs(psalms).toEqual([
    `horas/Latin/Psalterium/Psalmi/Psalmi minor:Tridentinum:${antiphonSelector}`,
    ...Array.from({ length: selectors.length - 1 }, () => '-')
  ]);
  expect(psalms.map((entry) => entry.psalmRef.selector)).toEqual(selectors);
}
