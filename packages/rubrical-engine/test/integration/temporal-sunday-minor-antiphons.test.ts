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
          ['2024-02-11', 'horas/Latin/Tempora/Quadp3-0'],
          ['2024-02-18', 'horas/Latin/Tempora/Quad1-0']
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
    'keeps 1955 Sunday minor-hour later blocks on the source-backed Minor Special responsories',
    async () => {
      const engines = await loadEngines(['Reduced - 1955']);
      const engine = engines.get('Reduced - 1955');
      expect(engine).toBeDefined();
      if (!engine) {
        return;
      }

      const cases = [
        {
          hour: 'terce',
          chapter: 'horas/Latin/Tempora/Quadp1-0:Capitulum Laudes',
          responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Tertia',
          versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Tertia'
        },
        {
          hour: 'sext',
          chapter: 'horas/Latin/Tempora/Quadp1-0:Capitulum Sexta',
          responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Sexta',
          versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Sexta'
        },
        {
          hour: 'none',
          chapter: 'horas/Latin/Tempora/Quadp1-0:Capitulum Nona',
          responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Nona',
          versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Nona'
        }
      ] as const;

      for (const entry of cases) {
        expectSingleRef(slotAt(engine, '2024-01-28', entry.hour, 'chapter'), entry.chapter);
        expectSingleRef(slotAt(engine, '2024-01-28', entry.hour, 'responsory'), entry.responsory);
        expectSingleRef(slotAt(engine, '2024-01-28', entry.hour, 'versicle'), entry.versicle);
      }
    },
    240_000
  );

  it(
    'keeps Advent temporal minor-hour later blocks on the source-backed Adv responsories',
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

        const cases = [
          {
            hour: 'terce',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Adv Tertia',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Adv Tertia'
          },
          {
            hour: 'sext',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Adv Sexta',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Adv Sexta'
          },
          {
            hour: 'none',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Adv Nona',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Adv Nona'
          }
        ] as const;

        for (const date of ['2024-12-01', '2024-12-15', '2024-12-22'] as const) {
          for (const entry of cases) {
            expectSingleRef(slotAt(engine, date, entry.hour, 'responsory'), entry.responsory);
            expectSingleRef(slotAt(engine, date, entry.hour, 'versicle'), entry.versicle);
          }
        }
      }
    },
    240_000
  );

  it(
    'keeps Lent Sunday minor-hour later blocks on the source-backed Quad responsories',
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

        const cases = [
          {
            hour: 'terce',
            chapter: 'horas/Latin/Tempora/Quad1-0:Capitulum Laudes',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad Tertia',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad Tertia'
          },
          {
            hour: 'sext',
            chapter: 'horas/Latin/Tempora/Quad1-0:Capitulum Sexta',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad Sexta',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad Sexta'
          },
          {
            hour: 'none',
            chapter: 'horas/Latin/Tempora/Quad1-0:Capitulum Nona',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad Nona',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad Nona'
          }
        ] as const;

        for (const entry of cases) {
          expectSingleRef(slotAt(engine, '2024-02-18', entry.hour, 'chapter'), entry.chapter);
          expectSingleRef(slotAt(engine, '2024-02-18', entry.hour, 'responsory'), entry.responsory);
          expectSingleRef(slotAt(engine, '2024-02-18', entry.hour, 'versicle'), entry.versicle);
        }
      }
    },
    240_000
  );

  it(
    'keeps Passiontide Sunday minor-hour later blocks on the source-backed Quad5 responsories',
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
          ['2024-03-17', 'horas/Latin/Tempora/Quad5-0'],
          ['2024-03-24', 'horas/Latin/Tempora/Quad6-0r']
        ] as const) {
          const cases = [
            {
              hour: 'terce',
              chapter: `${officePath}:Capitulum Laudes`,
              responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Tertia',
              versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Tertia'
            },
            {
              hour: 'sext',
              chapter: `${officePath}:Capitulum Sexta`,
              responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Sexta',
              versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Sexta'
            },
            {
              hour: 'none',
              chapter: `${officePath}:Capitulum Nona`,
              responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Nona',
              versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Nona'
            }
          ] as const;

          for (const entry of cases) {
            expectSingleRef(slotAt(engine, date, entry.hour, 'chapter'), entry.chapter);
            expectSingleRef(slotAt(engine, date, entry.hour, 'responsory'), entry.responsory);
            expectSingleRef(slotAt(engine, date, entry.hour, 'versicle'), entry.versicle);
          }
        }
      }
    },
    240_000
  );

  it(
    'keeps Passion Week ferial minor-hour later blocks on the source-backed Quad5 responsories',
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

        const cases = [
          {
            hour: 'terce',
            chapter: 'horas/Latin/Psalterium/Special/Minor Special:Quad5 Tertia',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Tertia',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Tertia'
          },
          {
            hour: 'sext',
            chapter: 'horas/Latin/Psalterium/Special/Minor Special:Quad5 Sexta',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Sexta',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Sexta'
          },
          {
            hour: 'none',
            chapter: 'horas/Latin/Psalterium/Special/Minor Special:Quad5 Nona',
            responsory: 'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Quad5 Nona',
            versicle: 'horas/Latin/Psalterium/Special/Minor Special:Versum Quad5 Nona'
          }
        ] as const;

        for (const date of ['2024-03-20', '2024-03-23'] as const) {
          for (const entry of cases) {
            expectSingleRef(slotAt(engine, date, entry.hour, 'chapter'), entry.chapter);
            expectSingleRef(slotAt(engine, date, entry.hour, 'responsory'), entry.responsory);
            expectSingleRef(slotAt(engine, date, entry.hour, 'versicle'), entry.versicle);
          }
        }
      }
    },
    240_000
  );

  it(
    'uses the source-backed Lent weekday minor-hour antiphon table over ordinary weekday psalms',
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

        expectMinorHour(
          psalmodyAt(engine, '2024-02-24', 'prime'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:1#antiphon',
          handle === 'Reduced - 1955'
            ? ['93(1-11)', '93(12-23)', '107', '[149]']
            : ['93(1-11)', '93(12-23)', '107']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-14', 'prime'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:1#antiphon',
          handle === 'Reduced - 1955'
            ? ['25', '51', '52', '[96]']
            : ['25', '51', '52']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-24', 'terce'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:2#antiphon',
          ['101(2-13)', '101(14-23)', '101(24-29)']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-14', 'terce'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:2#antiphon',
          ['53', '54(2-16)', '54(17-24)']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-24', 'sext'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:3#antiphon',
          ['103(1-12)', '103(13-23)', '103(24-35)']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-14', 'sext'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:3#antiphon',
          ['55', '56', '57']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-24', 'none'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:5#antiphon',
          ['108(2-13)', '108(14-21)', '108(22-31)']
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-02-14', 'none'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Quad:5#antiphon',
          ['58(2-11)', '58(12-18)', '59']
        );
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

        // Trinity Sunday's [Rule] adds the `Symbolum Athanasium` directive,
        // so Prime appends Psalm 234 (Athanasian Creed) — the other two
        // festal Sundays do not carry that directive and stop at three
        // psalms.
        expectMinorHour(
          psalmodyAt(engine, '2024-05-26', 'prime'),
          'horas/Latin/Tempora/Pent01-0r:Ant Laudes:1',
          ['53', '118(1-16)', '118(17-32)', undefined as unknown as string]
        );

        for (const [date, officePath] of [
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
    'ignores condition-gated Saturday Office BVM antiphon sections outside their rubrics',
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

        expect(psalmodyAt(engine, '2024-07-06', 'lauds').map((entry) => entry.antiphonRef ?? null)).toEqual([
          null,
          null,
          null,
          null,
          null
        ]);
        expectMinorHour(
          psalmodyAt(engine, '2024-07-06', 'prime'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Prima:Sabbato#antiphon',
          [
          '93(1-11)',
          '93(12-23)',
          '107'
          ]
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-07-06', 'terce'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Tertia:Sabbato#antiphon',
          [
          '101(2-13)',
          '101(14-23)',
          '101(24-29)'
          ]
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-07-06', 'sext'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Sexta:Sabbato#antiphon',
          [
          '103(1-12)',
          '103(13-23)',
          '103(24-35)'
          ]
        );
        expectMinorHour(
          psalmodyAt(engine, '2024-07-06', 'none'),
          'horas/Latin/Psalterium/Psalmi/Psalmi minor:Nona:Sabbato#antiphon',
          [
          '108(2-13)',
          '108(14-21)',
          '108(22-31)'
          ]
        );
        expectMajorHourPsalmodySection(
          psalmodyAt(engine, '2024-07-06', 'vespers'),
          'horas/Latin/Psalterium/Psalmi/Psalmi major:Day6 Vespera'
        );
      }
    },
    240_000
  );

  it(
    'keeps weekday feasts with Psalmi Dominica on Sunday Lauds I instead of penitential Lauds II',
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

        const lauds = psalmodyAt(engine, '2024-03-19', 'lauds');
        expectMajorHour(lauds, 'horas/Latin/Sancti/03-19:Ant Laudes');
        expect(lauds.map((entry) => `${entry.psalmRef.section}:${entry.psalmRef.selector}`)).toEqual([
          'Day0 Laudes1:1',
          'Day0 Laudes1:2',
          'Day0 Laudes1:3',
          'Day0 Laudes1:4',
          'Day0 Laudes1:5'
        ]);
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
    'keeps Easter Octave Lauds and Vespers on proper paschal antiphons even when minor hours omit theirs',
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
          expectMajorHour(psalmodyAt(engine, date, 'lauds'), 'horas/Latin/Tempora/Pasc0-0:Ant Laudes');
          expectMajorHour(psalmodyAt(engine, date, 'vespers'), 'horas/Latin/Tempora/Pasc0-0:Ant Vespera');
        }
      }
    },
    240_000
  );

  it(
    'keeps Easter Octave Vespers Magnificat between the proper antiphon and the oration',
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
          const vespers = engine.resolveDayOfficeSummary(date).hours.vespers;
          expect(vespers, `${handle} ${date} Vespers`).toBeDefined();
          if (!vespers) {
            continue;
          }

          const slotOrder = Object.keys(vespers.slots as Record<string, unknown>);
          const canticleIndex = slotOrder.indexOf('canticle-ad-magnificat');
          expect(
            canticleIndex,
            `${handle} ${date} Vespers should expose a Magnificat canticle slot`
          ).toBeGreaterThanOrEqual(0);
          expect(
            canticleIndex,
            `${handle} ${date} Vespers should place Magnificat after the antiphon ad Magnificat`
          ).toBeGreaterThan(slotOrder.indexOf('antiphon-ad-magnificat'));
          expect(
            canticleIndex,
            `${handle} ${date} Vespers should place Magnificat before the oration`
          ).toBeLessThan(slotOrder.indexOf('oration'));

          expectSingleRef(
            vespers.slots['canticle-ad-magnificat'],
            'horas/Latin/Psalterium/Psalmorum/Psalm232:__preamble'
          );
        }
      }
    },
    240_000
  );

  it(
    'keeps Christmas-octave second Vespers on the proper Ant Vespera 3 psalm numbers',
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

        for (const date of ['2024-12-25', '2024-12-26', '2024-12-27'] as const) {
          expectMajorHourPsalmSlot(
            psalmodyAt(engine, date, 'vespers'),
            3,
            'Ant Vespera 3',
            '129'
          );
        }

        expectMajorHourPsalmSlot(
          psalmodyAt(engine, '2024-12-27', 'vespers'),
          4,
          'Ant Vespera 3',
          '131'
        );
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
    'uses the Lenten feria Oratio 2 collect for minor hours when the temporal file has no Oratio section',
    async () => {
      const engines = await loadEngines(['Rubrics 1960 - 1960']);
      const engine = engines.get('Rubrics 1960 - 1960');
      expect(engine).toBeDefined();
      if (!engine) {
        return;
      }

      const summary = engine.resolveDayOfficeSummary('2026-02-23');
      expect(summary.temporal.dayName).toBe('Quad1-1');

      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        expectSingleRef(
          summary.hours[hour]?.slots.oration,
          'horas/Latin/Tempora/Quad1-1:Oratio 2'
        );
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
  hour: 'lauds' | 'vespers' | 'prime' | 'terce' | 'sext' | 'none'
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

function expectMajorHour(
  psalms: readonly PsalmAssignment[],
  antiphonSection: string
) {
  expect(psalms).toHaveLength(5);
  expect(
    psalms.map((entry) =>
      entry.antiphonRef
        ? `${entry.antiphonRef.path}:${entry.antiphonRef.section}${entry.antiphonRef.selector ? `:${entry.antiphonRef.selector}` : ''}`
        : '-'
    )
  ).toEqual([
    `${antiphonSection}:1`,
    `${antiphonSection}:2`,
    `${antiphonSection}:3`,
    `${antiphonSection}:4`,
    `${antiphonSection}:5`
  ]);
}

function expectMajorHourPsalmodySection(
  psalms: readonly PsalmAssignment[],
  section: string
) {
  expect(psalms).toHaveLength(5);
  expect(
    psalms.map((entry) => `${entry.psalmRef.path}:${entry.psalmRef.section}`)
  ).toEqual(Array.from({ length: 5 }, () => section));
  expect(psalms.map((entry) => entry.psalmRef.selector)).toEqual(['1', '2', '3', '4', '5']);
}

function expectMajorHourPsalmSlot(
  psalms: readonly PsalmAssignment[],
  index: number,
  antiphonSection: string,
  psalmNumber: string
) {
  const slot = psalms[index];
  expect(slot?.antiphonRef?.section).toBe(antiphonSection);
  expect(slot?.psalmRef.path).toBe(`horas/Latin/Psalterium/Psalmorum/Psalm${psalmNumber}`);
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
  slot: { readonly kind: string; readonly ref?: { readonly path: string; readonly section: string } } | undefined,
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
