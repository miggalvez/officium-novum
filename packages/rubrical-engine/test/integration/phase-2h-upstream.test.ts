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
  type RubricalEngine
} from '../../src/index.js';

interface Phase2hFixtureVersion {
  readonly version: string;
  readonly occurrence: readonly {
    readonly date: string;
    readonly celebrationPath: string;
    readonly commemorations: readonly string[];
    readonly transferredFrom: string | null;
  }[];
  readonly concurrence: readonly {
    readonly date: string;
    readonly winner: 'today' | 'tomorrow';
    readonly sourcePath: string;
    readonly commemorations: readonly string[];
    readonly complineSourceKind: 'vespers-winner' | 'ordinary' | 'triduum-special';
  }[];
  readonly hours: readonly {
    readonly date: string;
    readonly laudsDirectives: readonly string[];
    readonly vespersDirectives: readonly string[];
  }[];
  readonly matins: readonly {
    readonly date: string;
    readonly nocturns: 1 | 3;
    readonly totalLessons: 3 | 9 | 12;
    readonly teDeum: 'say' | 'replace-with-responsory' | 'omit';
  }[];
}

interface Phase2hFixtureFile {
  readonly versions: readonly Phase2hFixtureVersion[];
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const FIXTURE_PATH = resolve(TEST_DIR, '../fixtures/phase-2h-roman-2024.json');
const HAS_FIXTURE = existsSync(FIXTURE_PATH);
const describeIfReady = HAS_UPSTREAM && HAS_FIXTURE ? describe : describe.skip;

let enginesPromise:
  | Promise<
      ReadonlyMap<
        string,
        RubricalEngine
      >
    >
  | null = null;

describeIfReady('Phase 2h DA/1955 upstream matrix', () => {
  it('matches the 2024 occurrence, concurrence, hour, and Matins fixtures', async () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Phase2hFixtureFile;
    const engines = await loadEngines(fixture.versions.map((entry) => entry.version));

    for (const versionFixture of fixture.versions) {
      const engine = engines.get(versionFixture.version);
      expect(engine, `missing engine for ${versionFixture.version}`).toBeDefined();
      if (!engine) {
        continue;
      }

      for (const row of versionFixture.occurrence) {
        const summary = engine.resolveDayOfficeSummary(row.date);
        expect(summary.celebration.feastRef.path).toBe(row.celebrationPath);
        expect(summary.commemorations.map((entry) => entry.feastRef.path)).toEqual(
          row.commemorations
        );
        expect(summary.celebration.transferredFrom ?? null).toBe(row.transferredFrom);
      }

      for (const row of versionFixture.concurrence) {
        const summary = engine.resolveDayOfficeSummary(row.date);
        expect(summary.concurrence.winner).toBe(row.winner);
        expect(summary.concurrence.source.feastRef.path).toBe(row.sourcePath);
        expect(summary.concurrence.commemorations.map((entry) => entry.feastRef.path)).toEqual(
          row.commemorations
        );
        expect(summary.compline.source.kind).toBe(row.complineSourceKind);
      }

      for (const row of versionFixture.hours) {
        const summary = engine.resolveDayOfficeSummary(row.date);
        expect(summary.hours.lauds?.directives).toEqual(row.laudsDirectives);
        expect(summary.hours.vespers?.directives).toEqual(row.vespersDirectives);
      }

      for (const row of versionFixture.matins) {
        const summary = engine.resolveDayOfficeSummary(row.date);
        const psalmody = summary.hours.matins?.slots.psalmody;
        const teDeum = summary.hours.matins?.slots['te-deum'];
        expect(psalmody?.kind).toBe('matins-nocturns');
        expect(teDeum?.kind).toBe('te-deum');
        if (psalmody?.kind !== 'matins-nocturns' || teDeum?.kind !== 'te-deum') {
          continue;
        }
        expect(psalmody.nocturns).toHaveLength(row.nocturns);
        expect(psalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(
          row.totalLessons
        );
        expect(teDeum.decision).toBe(row.teDeum);
      }
    }
  }, 240_000);

  it('resolves every 2024 day without throwing for all supported Roman handle bindings', async () => {
    const handles = [
      'Divino Afflatu - 1939',
      'Divino Afflatu - 1954',
      'Reduced - 1955',
      'Rubrics 1960 - 1960',
      'Rubrics 1960 - 2020 USA'
    ] as const;
    const engines = await loadEngines(handles);

    for (const handle of handles) {
      const engine = engines.get(handle);
      expect(engine, `missing engine for ${handle}`).toBeDefined();
      if (!engine) {
        continue;
      }

      for (const date of isoDatesInYear(2024)) {
        expect(() => engine.resolveDayOfficeSummary(date), `${handle} ${date}`).not.toThrow();
      }
    }
  }, 240_000);

  it('covers the targeted extra-year edge cases explicitly', async () => {
    const engines = await loadEngines([
      'Divino Afflatu - 1954',
      'Reduced - 1955',
      'Rubrics 1960 - 1960'
    ]);

    for (const handle of ['Divino Afflatu - 1954', 'Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const engine = engines.get(handle);
      expect(engine).toBeDefined();
      if (!engine) {
        continue;
      }

      const annunciation = engine.resolveDayOfficeSummary('2024-03-25');
      expect(annunciation.celebration.feastRef.path).toBe('Tempora/Quad6-1');

      const immaculate = engine.resolveDayOfficeSummary('2024-12-08');
      expect(immaculate.celebration.feastRef.path).toBe('Sancti/12-08');
      expect(immaculate.commemorations.map((entry) => entry.feastRef.path)).toContain(
        'Tempora/Adv2-0'
      );

      const epiphanyPressure = engine.resolveDayOfficeSummary('2025-01-05');
      expect(epiphanyPressure.concurrence.source.feastRef.path).toBe('Sancti/01-06');
    }

    for (const handle of ['Divino Afflatu - 1954', 'Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const engine = engines.get(handle);
      expect(engine).toBeDefined();
      if (!engine) {
        continue;
      }

      const palmSundayJoseph = engine.resolveDayOfficeSummary('2062-03-19');
      expect(palmSundayJoseph.celebration.feastRef.path).toBe(
        handle === 'Divino Afflatu - 1954' ? 'Tempora/Quad6-0' : 'Tempora/Quad6-0r'
      );

      const transferredJoseph = findTransferredCelebration(engine, 'Sancti/03-19', '2062-03-19', 30);
      expect(transferredJoseph?.date).toBe('2062-04-04');
      expect(transferredJoseph?.summary.celebration.transferredFrom).toBe('2062-03-19');
    }
  }, 240_000);

  it('locks the repaired pre-1955 concurrence and octave edge cases', async () => {
    const engines = await loadEngines(['Divino Afflatu - 1954', 'Reduced - 1955']);

    const divinoAfflatu = engines.get('Divino Afflatu - 1954');
    expect(divinoAfflatu).toBeDefined();
    if (divinoAfflatu) {
      const circumcision = divinoAfflatu.resolveDayOfficeSummary('2024-01-01');
      expect(circumcision.concurrence.winner).toBe('today');
      expect(circumcision.concurrence.source.feastRef.path).toBe('Sancti/01-01');

      const emberSaturday = divinoAfflatu.resolveDayOfficeSummary('2024-02-24');
      expect(emberSaturday.celebration.feastRef.path).toBe('Tempora/Quad1-6');
      expect(emberSaturday.commemorations.map((entry) => entry.feastRef.path)).toEqual([
        'Sancti/02-23o'
      ]);

      const johnEudes = divinoAfflatu.resolveDayOfficeSummary('2024-08-19');
      expect(johnEudes.concurrence.winner).toBe('tomorrow');
      expect(johnEudes.concurrence.source.feastRef.path).toBe('Sancti/08-20');
    }

    const reduced1955 = engines.get('Reduced - 1955');
    expect(reduced1955).toBeDefined();
    if (reduced1955) {
      const rosarySunday = reduced1955.resolveDayOfficeSummary('2024-10-06');
      expect(rosarySunday.concurrence.winner).toBe('tomorrow');
      expect(rosarySunday.concurrence.source.feastRef.path).toBe('Sancti/10-07');
    }
  }, 240_000);

  it('locks the clarified 1960 source-backed fixes', async () => {
    const engines = await loadEngines(['Rubrics 1960 - 1960']);
    const roman1960 = engines.get('Rubrics 1960 - 1960');
    expect(roman1960).toBeDefined();
    if (!roman1960) {
      return;
    }

    const ashWednesday = roman1960.resolveDayOfficeSummary('2024-02-14');
    const ashPsalmody = ashWednesday.hours.matins?.slots.psalmody;
    expect(ashPsalmody?.kind).toBe('matins-nocturns');
    if (ashPsalmody?.kind === 'matins-nocturns') {
      expect(ashPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const emberSaturday = roman1960.resolveDayOfficeSummary('2024-02-24');
    const emberPsalmody = emberSaturday.hours.matins?.slots.psalmody;
    expect(emberPsalmody?.kind).toBe('matins-nocturns');
    if (emberPsalmody?.kind === 'matins-nocturns') {
      expect(emberPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const holyWeekWednesday = roman1960.resolveDayOfficeSummary('2024-03-27');
    expect(holyWeekWednesday.concurrence.winner).toBe('today');
    expect(holyWeekWednesday.concurrence.source.feastRef.path).toBe('Tempora/Quad6-3');
    expect(holyWeekWednesday.commemorations).toEqual([]);
    const holyWeekPsalmody = holyWeekWednesday.hours.matins?.slots.psalmody;
    expect(holyWeekPsalmody?.kind).toBe('matins-nocturns');
    if (holyWeekPsalmody?.kind === 'matins-nocturns') {
      expect(holyWeekPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const easterTuesday = roman1960.resolveDayOfficeSummary('2024-04-02');
    expect(easterTuesday.commemorations).toEqual([]);
    const easterPsalmody = easterTuesday.hours.matins?.slots.psalmody;
    expect(easterPsalmody?.kind).toBe('matins-nocturns');
    if (easterPsalmody?.kind === 'matins-nocturns') {
      expect(easterPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const palmSunday = roman1960.resolveDayOfficeSummary('2024-03-24');
    expect(palmSunday.celebration.feastRef.path).toBe('Tempora/Quad6-0r');

    const holyThursday = roman1960.resolveDayOfficeSummary('2024-03-28');
    expect(holyThursday.celebration.feastRef.path).toBe('Tempora/Quad6-4r');

    const goodFriday = roman1960.resolveDayOfficeSummary('2024-03-29');
    expect(goodFriday.celebration.feastRef.path).toBe('Tempora/Quad6-5r');

    const holySaturday = roman1960.resolveDayOfficeSummary('2024-03-30');
    expect(holySaturday.celebration.feastRef.path).toBe('Tempora/Quad6-6r');

    const ascension = roman1960.resolveDayOfficeSummary('2024-05-09');
    expect(ascension.commemorations).toEqual([]);

    const trinity = roman1960.resolveDayOfficeSummary('2024-05-26');
    expect(trinity.celebration.feastRef.path).toBe('Tempora/Pent01-0r');
    expect(trinity.commemorations).toEqual([]);
    expect(trinity.concurrence.source.feastRef.path).toBe('Tempora/Pent01-0r');

    const christmasVigil = roman1960.resolveDayOfficeSummary('2024-12-24');
    const vigilPsalmody = christmasVigil.hours.matins?.slots.psalmody;
    expect(vigilPsalmody?.kind).toBe('matins-nocturns');
    if (vigilPsalmody?.kind === 'matins-nocturns') {
      expect(vigilPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }
  }, 240_000);

  it('locks the clarified pre-1960 engine-side fixes', async () => {
    const engines = await loadEngines(['Divino Afflatu - 1954', 'Reduced - 1955']);

    const divino = engines.get('Divino Afflatu - 1954');
    const reduced = engines.get('Reduced - 1955');
    expect(divino).toBeDefined();
    expect(reduced).toBeDefined();
    if (!divino || !reduced) {
      return;
    }

    const circumcision = divino.resolveDayOfficeSummary('2024-01-01');
    expect(circumcision.commemorations).toEqual([]);
    expect(circumcision.concurrence.source.feastRef.path).toBe('Sancti/01-01');

    const epiphany = divino.resolveDayOfficeSummary('2024-01-06');
    expect(epiphany.commemorations).toEqual([]);

    const emberSaturday = divino.resolveDayOfficeSummary('2024-02-24');
    const emberPsalmody = emberSaturday.hours.matins?.slots.psalmody;
    expect(emberPsalmody?.kind).toBe('matins-nocturns');
    if (emberPsalmody?.kind === 'matins-nocturns') {
      expect(emberPsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const holySaturday = divino.resolveDayOfficeSummary('2024-03-30');
    expect(holySaturday.concurrence.winner).toBe('tomorrow');
    expect(holySaturday.concurrence.source.feastRef.path).toBe('Tempora/Pasc0-0');

    const divinoChristmasEve = divino.resolveDayOfficeSummary('2024-12-24');
    expect(divinoChristmasEve.commemorations).toEqual([]);
    const divinoChristmasEvePsalmody = divinoChristmasEve.hours.matins?.slots.psalmody;
    expect(divinoChristmasEvePsalmody?.kind).toBe('matins-nocturns');
    if (divinoChristmasEvePsalmody?.kind === 'matins-nocturns') {
      expect(divinoChristmasEvePsalmody.nocturns.flatMap((entry) => entry.lessons)).toHaveLength(3);
    }

    const baptism = reduced.resolveDayOfficeSummary('2024-01-13');
    expect(baptism.concurrence.source.feastRef.path).toBe('Sancti/01-13');

    const palmSunday = reduced.resolveDayOfficeSummary('2024-03-24');
    expect(palmSunday.celebration.feastRef.path).toBe('Tempora/Quad6-0r');
    expect(palmSunday.commemorations).toEqual([]);

    const holyThursday = reduced.resolveDayOfficeSummary('2024-03-28');
    expect(holyThursday.celebration.feastRef.path).toBe('Tempora/Quad6-4r');

    const trinity = reduced.resolveDayOfficeSummary('2024-05-26');
    expect(trinity.celebration.feastRef.path).toBe('Tempora/Pent01-0r');
    expect(trinity.concurrence.source.feastRef.path).toBe('Tempora/Pent01-0r');

    const reducedChristmasEve = reduced.resolveDayOfficeSummary('2024-12-24');
    expect(reducedChristmasEve.commemorations).toEqual([]);
  }, 240_000);

  it('encodes Limit Benedictiones Oratio as the secret Pater-only Matins lesson introduction in Roman 1955/1960', async () => {
    const engines = await loadEngines(['Reduced - 1955', 'Rubrics 1960 - 1960']);

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const engine = engines.get(version);
      expect(engine, `missing engine for ${version}`).toBeDefined();
      if (!engine) {
        continue;
      }

      for (const date of ['2024-03-28', '2024-03-29'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const psalmody = summary.hours.matins?.slots.psalmody;
        expect(psalmody?.kind, `${version} ${date} Matins should keep a nocturn plan`).toBe(
          'matins-nocturns'
        );
        if (psalmody?.kind !== 'matins-nocturns') {
          continue;
        }

        expect(
          psalmody.nocturns.map((nocturn) => nocturn.lessonIntroduction),
          `${version} ${date} should replace the ordinary Matins pre-lesson bundle`
        ).toEqual(['pater-totum-secreto', 'pater-totum-secreto', 'pater-totum-secreto']);
        expect(
          psalmody.nocturns.map((nocturn) => nocturn.benedictions),
          `${version} ${date} should suppress Matins benedictions under Limit Benedictiones Oratio`
        ).toEqual([[], [], []]);
      }
    }
  }, 240_000);
});

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
          'Divino Afflatu - 1939',
          'Divino Afflatu - 1954',
          'Reduced - 1955',
          'Rubrics 1960 - 1960',
          'Rubrics 1960 - 2020 USA'
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

function* isoDatesInYear(year: number): Generator<string> {
  for (
    const current = new Date(Date.UTC(year, 0, 1));
    current.getUTCFullYear() === year;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    yield `${current.getUTCFullYear().toString().padStart(4, '0')}-${(current.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}-${current.getUTCDate().toString().padStart(2, '0')}`;
  }
}

function findTransferredCelebration(
  engine: RubricalEngine,
  feastPath: string,
  fromDate: string,
  maxDays: number
): { readonly date: string; readonly summary: ReturnType<RubricalEngine['resolveDayOfficeSummary']> } | undefined {
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const date = addDaysIso(fromDate, offset);
    const summary = engine.resolveDayOfficeSummary(date);
    if (
      summary.celebration.feastRef.path === feastPath &&
      summary.celebration.transferredFrom === fromDate
    ) {
      return { date, summary };
    }
  }

  return undefined;
}

function addDaysIso(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
}
