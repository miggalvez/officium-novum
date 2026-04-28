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
  type RubricalEngine
} from '@officium-novum/rubrical-engine';
import { beforeAll, describe, expect, it } from 'vitest';

import { composeHour } from '../../src/compose.js';
import type {
  ComposeWarning,
  ComposedHour,
  ComposedLine,
  ComposedRun,
  Section
} from '../../src/types/composed-hour.js';
import {
  PHASE_3_GOLDEN_DATES,
  PHASE_3_ROMAN_HANDLES
} from '../fixtures/phase-3-golden-dates.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const GOLDENS_ROOT = resolve(TEST_DIR, '..', '__goldens__');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

/**
 * Phase 3 §18 success criterion #3 — 312 snapshot goldens
 * (13 Appendix-A dates × 3 Roman policies × 8 Hours).
 *
 * The goldens are a stabilization tripwire: once 3h adjudication settled the
 * three Roman ledgers at zero `unadjudicated` rows, the compose output is
 * frozen so that any future change to the composer surfaces as a diffable
 * golden update. The serialization is intentionally text — line-oriented,
 * one file per cell — so reviewers can read goldens as Office text rather
 * than as opaque structured snapshots.
 *
 * Files live at
 *   `packages/compositor/test/__goldens__/<policy-slug>/<date>/<hour>.golden.txt`
 *
 * On first run, vitest writes new files. On subsequent runs the test fails
 * if any cell drifts. To regenerate intentionally:
 *   `pnpm -C packages/compositor test -u -- test/integration/appendix-a-snapshots.test.ts`
 *
 * Gated on `HAS_UPSTREAM`, like the rest of the integration suite.
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

const POLICY_SLUGS: Readonly<Record<(typeof PHASE_3_ROMAN_HANDLES)[number], string>> = {
  'Divino Afflatu - 1954': 'divino-afflatu',
  'Reduced - 1955': 'reduced-1955',
  'Rubrics 1960 - 1960': 'rubrics-1960'
};

interface SharedResources {
  readonly rawCorpus: Awaited<ReturnType<typeof loadCorpus>>;
  readonly resolvedCorpus: Awaited<ReturnType<typeof loadCorpus>>;
  readonly versionRegistry: ReturnType<typeof buildVersionRegistry>;
  readonly kalendarium: ReturnType<typeof buildKalendariumTable>;
  readonly yearTransfers: ReturnType<typeof buildYearTransferTable>;
  readonly scriptureTransfers: ReturnType<typeof buildScriptureTransferTable>;
}

let sharedResources: SharedResources | undefined;
const engineCache = new Map<string, RubricalEngine>();

async function loadSharedResources(): Promise<SharedResources> {
  if (sharedResources) return sharedResources;
  const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
  const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
  const versionRegistry = buildVersionRegistry(
    parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
  );
  sharedResources = {
    rawCorpus,
    resolvedCorpus,
    versionRegistry,
    kalendarium: buildKalendariumTable(loadKalendaria()),
    yearTransfers: buildYearTransferTable(loadTransferTables()),
    scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables())
  };
  return sharedResources;
}

function getEngine(version: string, resources: SharedResources): RubricalEngine {
  const cached = engineCache.get(version);
  if (cached) return cached;
  const engine = createRubricalEngine({
    corpus: resources.rawCorpus.index,
    kalendarium: resources.kalendarium,
    yearTransfers: resources.yearTransfers,
    scriptureTransfers: resources.scriptureTransfers,
    versionRegistry: resources.versionRegistry,
    version: asVersionHandle(version),
    policyMap: VERSION_POLICY
  });
  engineCache.set(version, engine);
  return engine;
}

describeIfUpstream(
  'Phase 3 Appendix-A snapshot goldens (13 dates × 3 policies × 8 hours = 312 cells)',
  () => {
    beforeAll(async () => {
      await loadSharedResources();
    }, 240_000);

    for (const version of PHASE_3_ROMAN_HANDLES) {
      describe(version, () => {
        for (const date of PHASE_3_GOLDEN_DATES) {
          describe(date, () => {
            for (const hour of HOURS) {
              it(hour, async () => {
                const resources = await loadSharedResources();
                const engine = getEngine(version, resources);
                const summary = engine.resolveDayOfficeSummary(date);
                const hourStructure = summary.hours[hour];
                const goldenPath = resolve(
                  GOLDENS_ROOT,
                  POLICY_SLUGS[version],
                  date,
                  `${hour}.golden.txt`
                );
                if (!hourStructure) {
                  await expect(
                    `policy: ${version}\ndate: ${date}\nhour: ${hour}\n(no hour structure on this date)\n`
                  ).toMatchFileSnapshot(goldenPath);
                  return;
                }
                const composed = composeHour({
                  corpus: resources.resolvedCorpus.index,
                  summary,
                  version: engine.version,
                  hour,
                  options: { languages: ['Latin'] }
                });
                const errorWarnings = composed.warnings.filter(
                  (warning) => warning.severity === 'error'
                );
                const unresolvedRuns = findUnresolvedRuns(composed);
                expect(
                  errorWarnings,
                  `${version} ${date} ${hour} emitted error warnings`
                ).toEqual([]);
                expect(
                  unresolvedRuns,
                  `${version} ${date} ${hour} emitted unresolved runs`
                ).toEqual([]);
                const text = serializeComposedHour(composed, version);
                await expect(text).toMatchFileSnapshot(goldenPath);
              }, 60_000);
            }
          });
        }
      });
    }
  }
);

function serializeComposedHour(composed: ComposedHour, version: string): string {
  const out: string[] = [];
  out.push(`policy: ${version}`);
  out.push(`date: ${composed.date}`);
  out.push(`hour: ${composed.hour}`);
  out.push(`celebration: ${composed.celebration}`);
  out.push(`languages: ${composed.languages.join(', ')}`);
  out.push(`section count: ${composed.sections.length}`);
  out.push(`warning count: ${composed.warnings.length}`);
  out.push('');

  if (composed.warnings.length > 0) {
    out.push('# warnings');
    composed.warnings.forEach((warning, index) => {
      out.push(formatWarning(warning, index));
    });
    out.push('');
  }

  composed.sections.forEach((section, index) => {
    out.push(formatSectionHeader(section, index));
    if (section.heading) {
      out.push(`  heading: ${section.heading.kind} ${section.heading.ordinal}`);
    }
    if (section.lines.length === 0) {
      out.push('  (no lines)');
    } else {
      section.lines.forEach((line) => {
        out.push(...formatLine(line));
      });
    }
    out.push('');
  });

  return out.join('\n');
}

function findUnresolvedRuns(composed: ComposedHour): readonly string[] {
  const out: string[] = [];
  for (const section of composed.sections) {
    for (const line of section.lines) {
      for (const runs of Object.values(line.texts)) {
        for (const run of runs) {
          if (
            run.type === 'unresolved-macro' ||
            run.type === 'unresolved-formula' ||
            run.type === 'unresolved-reference'
          ) {
            out.push(`${section.slot}: ${formatRun(run)}`);
          }
        }
      }
    }
  }
  return out;
}

function formatSectionHeader(section: Section, index: number): string {
  const parts = [
    `[section #${index}`,
    `type=${section.type}`,
    `slot=${section.slot}`
  ];
  if (section.reference !== undefined) parts.push(`reference=${section.reference}`);
  parts.push(`languages=${section.languages.join('+')}`);
  return parts.join(' ') + ']';
}

function formatLine(line: ComposedLine): readonly string[] {
  const lines: string[] = [];
  const langs = Object.keys(line.texts).sort();
  if (langs.length === 0) {
    lines.push(line.marker !== undefined ? `  | ${line.marker} |` : '  | (empty) |');
    return lines;
  }
  for (const lang of langs) {
    const runs = line.texts[lang] ?? [];
    const markerPrefix = line.marker !== undefined ? `[${line.marker}] ` : '';
    if (runs.length === 0) {
      lines.push(`  ${lang}: ${markerPrefix}(empty runs)`);
      continue;
    }
    const rendered = runs.map(formatRun).join(' · ');
    lines.push(`  ${lang}: ${markerPrefix}${rendered}`);
  }
  return lines;
}

function formatRun(run: ComposedRun): string {
  switch (run.type) {
    case 'text':
      return `text(${stringify(run.value)})`;
    case 'rubric':
      return `rubric(${stringify(run.value)})`;
    case 'citation':
      return `citation(${stringify(run.value)})`;
    case 'unresolved-macro':
      return `unresolved-macro(${stringify(run.name)})`;
    case 'unresolved-formula':
      return `unresolved-formula(${stringify(run.name)})`;
    case 'unresolved-reference':
      return `unresolved-reference(${stringify(run.ref.path ?? '')}#${stringify(run.ref.section ?? '')})`;
  }
}

function formatWarning(warning: ComposeWarning, index: number): string {
  const parts = [`#${index}`, `[${warning.severity}]`, warning.code, '—', warning.message];
  if (warning.context) {
    const ctx = Object.entries(warning.context)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    if (ctx.length > 0) parts.push(`{${ctx}}`);
  }
  return parts.join(' ');
}

function stringify(value: string): string {
  return JSON.stringify(value);
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
