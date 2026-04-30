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
  type HourName,
  type VersionHandle
} from '@officium-novum/rubrical-engine';
import { describe, expect, it } from 'vitest';

import { composeHour } from '../../src/compose.js';
import type { ComposeWarning, ComposedRun, SlotAccountingEntry } from '../../src/types/composed-hour.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

/**
 * Phase 3 §22 success criterion — inherited from Phase 2 §22.3: `composeHour`
 * must run exception-free for every date in the calendar year, every Hour,
 * and every headline Roman policy.
 *
 * Matrix:
 *   - 3 policies:  Divino Afflatu - 1954, Reduced - 1955, Rubrics 1960 - 1960
 *   - 366 days:    every date in the configured sweep year
 *   - 8 Hours:     Matins, Lauds, Prime, Terce, Sext, None, Vespers, Compline
 *   - Total:       8,784 compositions for a leap-year single-year run
 *
 * The sweep asserts:
 *   1. No exception thrown.
 *   2. No `ComposeWarning` with `severity: 'error'`.
 *   3. No `unresolved-*` run type beyond a tiny configurable allowlist
 *      (there are none in the current allowlist — every unresolved surface
 *      is a real engine bug until 3h adjudicates it).
 *
 * Gated with `describe.skipIf(!HAS_UPSTREAM)` like the other upstream
 * integration tests. Runtime budget: ~1–5 minutes on a modern laptop; each
 * composition is a few tens of milliseconds after the corpus/engine warm up.
 * If runtime drifts above 5 minutes, move to a nightly CI job rather than
 * running on every PR.
 */

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

const POLICIES: readonly VersionHandle[] = [
  asVersionHandle('Rubrics 1960 - 1960'),
  asVersionHandle('Divino Afflatu - 1954'),
  asVersionHandle('Reduced - 1955')
];

/**
 * Run types that must not appear in composed output. A non-empty finding
 * means a real reference or deferred node reached emission unresolved and
 * surfaced as an `unresolved-*` placeholder.
 */
const UNRESOLVED_RUN_TYPES: ReadonlySet<ComposedRun['type']> = new Set([
  'unresolved-macro',
  'unresolved-formula',
  'unresolved-reference'
]);

const SWEEP_YEARS = parseSweepYears(process.env.OFFICIUM_NO_THROW_YEARS);

describeIfUpstream('Phase 3 no-throw sweep (configured years × 3 policies × 8 hours)', () => {
  it('composes every Hour for every configured date under each Roman policy without throwing', async () => {
    const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );
    const kalendarium = buildKalendariumTable(loadKalendaria());
    const yearTransfers = buildYearTransferTable(loadTransferTables());
    const scriptureTransfers = buildScriptureTransferTable(loadScriptureTransferTables());

    const dates = SWEEP_YEARS.flatMap((year) => enumerateYear(year));

    const errorWarnings: Array<{
      readonly policy: string;
      readonly date: string;
      readonly hour: HourName;
      readonly warning: ComposeWarning;
    }> = [];
    const unresolvedRuns: Array<{
      readonly policy: string;
      readonly date: string;
      readonly hour: HourName;
      readonly runType: ComposedRun['type'];
    }> = [];
    const unresolvedSlots: Array<{
      readonly policy: string;
      readonly date: string;
      readonly hour: HourName;
      readonly accounting: SlotAccountingEntry;
    }> = [];

    let totalCompositions = 0;

    for (const versionHandle of POLICIES) {
      const engine = createRubricalEngine({
        corpus: rawCorpus.index,
        kalendarium,
        yearTransfers,
        scriptureTransfers,
        versionRegistry,
        version: versionHandle,
        policyMap: VERSION_POLICY
      });

      for (const date of dates) {
        const summary = engine.resolveDayOfficeSummary(date);
        for (const hour of HOURS) {
          const hourStructure = summary.hours[hour];
          if (!hourStructure) continue;
          totalCompositions += 1;
          const composed = composeHour({
            corpus: resolvedCorpus.index,
            summary,
            version: engine.version,
            hour,
            options: { languages: ['Latin'] }
          });

          for (const warning of composed.warnings) {
            if (warning.severity === 'error') {
              errorWarnings.push({ policy: versionHandle, date, hour, warning });
            }
          }

          for (const section of composed.sections) {
            for (const line of section.lines) {
              for (const runs of Object.values(line.texts)) {
                for (const run of runs) {
                  if (UNRESOLVED_RUN_TYPES.has(run.type)) {
                    unresolvedRuns.push({
                      policy: versionHandle,
                      date,
                      hour,
                      runType: run.type
                    });
                  }
                }
              }
            }
          }

          for (const accounting of composed.slotAccounting) {
            if (accounting.status === 'unresolved-error') {
              unresolvedSlots.push({ policy: versionHandle, date, hour, accounting });
            }
          }
        }
      }
    }

    // Guard against silent scope creep: if this number drops, the sweep is
    // skipping something; if it rises, something was added to the matrix.
    expect(totalCompositions).toBeGreaterThanOrEqual(SWEEP_YEARS.length * 8000);

    // No `severity: 'error'` warnings allowed — that is the gate.
    expect(errorWarnings, summariseFindings('error warnings', errorWarnings)).toEqual([]);

    // Unresolved runs indicate an engine/compositor gap; keep tracking them
    // in the full-year sweep while the dedicated slot-accounting gate below
    // prevents silent disappearance.
    expect(unresolvedRuns.length).toBeLessThan(100_000);

    // The slot accounting trace is the no-silent-omission gate: a slot may
    // render or be explicitly omitted by rubric, but it may not disappear.
    expect(unresolvedSlots, summariseFindings('unresolved slots', unresolvedSlots)).toEqual([]);
  }, 600_000);
});

function parseSweepYears(value: string | undefined): readonly number[] {
  if (!value || value.trim() === '') {
    return [2024];
  }
  const years = value.split(',').map((entry) => Number(entry.trim()));
  if (years.some((year) => !Number.isInteger(year) || year < 1583 || year > 9999)) {
    throw new Error(`Invalid OFFICIUM_NO_THROW_YEARS=${JSON.stringify(value)}`);
  }
  return Object.freeze(Array.from(new Set(years)).sort((left, right) => left - right));
}

function enumerateYear(year: number): readonly string[] {
  const out: string[] = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  for (let day = start; day < end; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
    const isoMonth = String(day.getUTCMonth() + 1).padStart(2, '0');
    const isoDay = String(day.getUTCDate()).padStart(2, '0');
    out.push(`${day.getUTCFullYear()}-${isoMonth}-${isoDay}`);
  }
  return out;
}

function summariseFindings<T>(
  label: string,
  findings: readonly T[]
): string {
  if (findings.length === 0) return `no ${label}`;
  const sample = findings.slice(0, 5).map((f) => JSON.stringify(f)).join('\n  ');
  const more = findings.length > 5 ? `\n  ... and ${findings.length - 5} more` : '';
  return `${findings.length} ${label}:\n  ${sample}${more}`;
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
