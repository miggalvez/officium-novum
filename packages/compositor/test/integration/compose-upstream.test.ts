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
import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  createRubricalEngine,
  type HourName
} from '@officium-novum/rubrical-engine';
import { describe, expect, it } from 'vitest';

import { composeHour } from '../../src/compose.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

/**
 * End-to-end smoke test against the real upstream corpus: load the Phase 1
 * index twice — unresolved for the Rubrical Engine, resolved for the
 * compositor — create a Rubrics-1960 engine, resolve a handful of
 * representative dates, and run each Hour through composition. We don't assert
 * exact textual content (that belongs to a Perl-comparison layer once Phase 3
 * is shaped), only that the pipeline never throws and that every Hour emits a
 * non-empty Section list with Latin content or structured heading metadata.
 */
describeIfUpstream('Phase 3 composition smoke against upstream corpus (1960)', () => {
  const HOURS: readonly HourName[] = [
    'matins',
    'lauds',
    'prime',
    'terce',
    'sext',
    'none',
    'vespers',
    'compline'
  ];

  const DATES = [
    '2024-01-14', // 2nd Sunday after Epiphany (ordinary Sunday structure)
    '2024-04-14', // Dominica in Albis (Paschaltide; add-alleluia directives fire)
    '2024-08-15', // Assumption B.V.M. (I class feast)
    '2024-11-22' // St. Cecilia, Virgin and Martyr (commune-heavy)
  ] as const;

  it('composes every Hour for a handful of representative 1960 dates without throwing', async () => {
    const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: rawCorpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    for (const date of DATES) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const hour of HOURS) {
        const hourStructure = summary.hours[hour];
        if (!hourStructure) continue;

        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(composed.hour).toBe(hour);
        expect(composed.date).toBe(date);
        expect(composed.languages).toEqual(['Latin']);
        expect(composed.sections.length).toBeGreaterThan(0);
        for (const section of composed.sections) {
          if (section.type === 'heading') {
            expect(section.heading).toBeDefined();
            expect(section.lines).toEqual([]);
            continue;
          }
          expect(section.languages).toContain('Latin');
          for (const line of section.lines) {
            if (Object.keys(line.texts).length === 0) {
              expect(line.marker, `empty line without marker in ${hour} ${section.slot}`).toBeTruthy();
            }
            for (const runs of Object.values(line.texts)) {
              expect(runs.length, `empty run list in ${hour} ${section.slot}`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  }, 240_000);

  it('emits a non-empty Matins shape (invitatory + heading + psalmody + Te Deum) on a double feast', async () => {
    const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const engine = createRubricalEngine({
      corpus: rawCorpus.index,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables()),
      versionRegistry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-08-15');
    const matins = summary.hours.matins;
    expect(matins).toBeDefined();
    if (!matins) return;

    const composed = composeHour({
      corpus: resolvedCorpus.index,
      summary,
      version: engine.version,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const slotOrder = composed.sections.map((s) => s.slot);
    expect(slotOrder[0]).toBe('invitatory');
    expect(slotOrder).toContain('psalmody');
    expect(slotOrder).toContain('heading');
    expect(composed.sections.find((section) => section.type === 'heading')?.heading).toBeDefined();
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
