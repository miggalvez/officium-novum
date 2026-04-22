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

  it(
    'keeps festal Sunday Prime on Prima Festis when Psalmi Dominica combines with proper minor-hour antiphons',
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
          ['2024-05-26', 'horas/Latin/Tempora/Pent01-0r'],
          ['2024-09-29', 'horas/Latin/Sancti/05-08'],
          ['2024-12-08', 'horas/Latin/Sancti/12-08']
        ] as const) {
          expectMinorHour(psalmodyAt(engine, date, 'prime'), `${officePath}:Ant Laudes:1`, [
            '53',
            '118(1-16)',
            '118(17-32)'
          ]);
        }
      }
    },
    240_000
  );

  it(
    'keeps Easter Octave minor hours on the dominica psalm table while omitting the opening antiphon',
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

        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-03-31', 'prime'), [
          '53',
          '117',
          '118(1-16)',
          '118(17-32)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-03-31', 'terce'), [
          '118(33-48)',
          '118(49-64)',
          '118(65-80)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-03-31', 'sext'), [
          '118(81-96)',
          '118(97-112)',
          '118(113-128)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-03-31', 'none'), [
          '118(129-144)',
          '118(145-160)',
          '118(161-176)'
        ]);

        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-04-03', 'prime'), [
          '53',
          '118(1-16)',
          '118(17-32)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-04-03', 'terce'), [
          '118(33-48)',
          '118(49-64)',
          '118(65-80)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-04-03', 'sext'), [
          '118(81-96)',
          '118(97-112)',
          '118(113-128)'
        ]);
        expectMinorHourWithoutAntiphon(psalmodyAt(engine, '2024-04-03', 'none'), [
          '118(129-144)',
          '118(145-160)',
          '118(161-176)'
        ]);
      }
    },
    240_000
  );

  it(
    'replaces the Easter Octave Prime and minor-hour later block with inherited Versum 2',
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

        for (const date of ['2024-03-31', '2024-04-01'] as const) {
          expectVersum2LaterBlock(engine, date, 'prime');
          expectVersum2LaterBlock(engine, date, 'terce');
          expectVersum2LaterBlock(engine, date, 'sext');
          expectVersum2LaterBlock(engine, date, 'none');
        }
      }
    },
    240_000
  );

  it(
    'keeps Easter Octave Prime on the ordinary Prima oration while the other minor hours keep the temporal collect',
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
          ['2024-03-31', 'horas/Latin/Tempora/Pasc0-0'],
          ['2024-04-02', 'horas/Latin/Tempora/Pasc0-2']
        ] as const) {
          expectOrderedRefs(slotAt(engine, date, 'prime', 'oration'), [
            'horas/Latin/Psalterium/Common/Prayers:oratio_Domine',
            'horas/Latin/Psalterium/Common/Prayers:Per Dominum'
          ]);
          expectSingleRef(slotAt(engine, date, 'terce', 'oration'), `${officePath}:Oratio`);
          expectSingleRef(slotAt(engine, date, 'sext', 'oration'), `${officePath}:Oratio`);
          expectSingleRef(slotAt(engine, date, 'none', 'oration'), `${officePath}:Oratio`);
        }
      }
    },
    240_000
  );

  it(
    'adds the Prime Martyrologium structural slot on Easter Octave weekdays while Triduum Prime still omits it',
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

        for (const date of ['2024-04-01', '2024-04-02'] as const) {
          expect(slotAt(engine, date, 'prime', 'martyrology')?.kind).toBe('prime-martyrology');
        }

        expect(slotAt(engine, '2024-03-29', 'prime', 'martyrology')?.kind).toBe('empty');
      }
    },
    240_000
  );

  it(
    'keeps Prime De Officio Capituli between the Martyrologium and Lectio brevis on Easter Octave weekdays',
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

        for (const date of ['2024-04-01', '2024-04-02'] as const) {
          const prime = engine.resolveDayOfficeSummary(date).hours.prime;
          expect(prime, `${handle} ${date} Prime`).toBeDefined();
          if (!prime) {
            continue;
          }

          const slotOrder = Object.keys(prime.slots as Record<string, unknown>);
          const capituliIndex = slotOrder.indexOf('de-officio-capituli');
          expect(
            capituliIndex,
            `${handle} ${date} Prime should expose a De Officio Capituli slot`
          ).toBeGreaterThanOrEqual(0);
          expect(
            capituliIndex,
            `${handle} ${date} Prime should place De Officio Capituli after the Martyrologium`
          ).toBeGreaterThan(slotOrder.indexOf('martyrology'));
          expect(
            capituliIndex,
            `${handle} ${date} Prime should place De Officio Capituli before Lectio brevis`
          ).toBeLessThan(slotOrder.indexOf('lectio-brevis'));
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

function expectMinorHourWithoutAntiphon(
  psalms: readonly PsalmAssignment[],
  selectors: readonly string[]
) {
  expect(psalms).toHaveLength(selectors.length);
  expect(psalms.map((entry) => entry.antiphonRef ?? null)).toEqual(
    Array.from({ length: selectors.length }, () => null)
  );
  expect(psalms.map((entry) => entry.psalmRef.selector)).toEqual(selectors);
}

function expectVersum2LaterBlock(
  engine: RubricalEngine,
  date: string,
  hour: 'prime' | 'terce' | 'sext' | 'none'
) {
  expectEmptySlot(slotAt(engine, date, hour, 'responsory'));
  expectEmptySlot(slotAt(engine, date, hour, 'versicle'));
  expectSingleRef(slotAt(engine, date, hour, 'chapter'), 'horas/Latin/Tempora/Pasc0-0:Versum 2');
}

function slotAt(
  engine: RubricalEngine,
  date: string,
  hour: 'prime' | 'terce' | 'sext' | 'none',
  slotName: 'chapter' | 'responsory' | 'versicle' | 'oration' | 'martyrology'
) {
  return engine.resolveDayOfficeSummary(date).hours[hour]?.slots[slotName];
}

function expectEmptySlot(slot: ReturnType<typeof slotAt>) {
  expect(slot?.kind).toBe('empty');
}

function expectSingleRef(
  slot: ReturnType<typeof slotAt>,
  expected: string
) {
  expect(slot?.kind).toBe('single-ref');
  if (!slot || slot.kind !== 'single-ref') {
    return;
  }

  expect(`${slot.ref.path}:${slot.ref.section}`).toBe(expected);
}

function expectOrderedRefs(
  slot: ReturnType<typeof slotAt>,
  expected: readonly string[]
) {
  expect(slot?.kind).toBe('ordered-refs');
  if (!slot || slot.kind !== 'ordered-refs') {
    return;
  }

  expect(slot.refs.map((ref) => `${ref.path}:${ref.section}`)).toEqual(expected);
}
