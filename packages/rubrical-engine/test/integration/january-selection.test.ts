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
      // Lauds and Vespers, and the source-backed `Antiphonas horas` rule
      // keeps proper antiphon ownership on the lead minor-hour slot.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:1',
        'horas/Latin/Sancti/01-01:Ant Laudes:2',
        'horas/Latin/Sancti/01-01:Ant Laudes:3',
        'horas/Latin/Sancti/01-01:Ant Laudes:4',
        'horas/Latin/Sancti/01-01:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'prime')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:1',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'terce')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:2',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'sext')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:3',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'none')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:5',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-01', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Vespera:1',
        'horas/Latin/Sancti/01-01:Ant Vespera:2',
        'horas/Latin/Sancti/01-01:Ant Vespera:3',
        'horas/Latin/Sancti/01-01:Ant Vespera:4',
        'horas/Latin/Sancti/01-01:Ant Vespera:5'
      ]);
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-01', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm109:__preamble:109',
        'horas/Latin/Psalterium/Psalmorum/Psalm110:__preamble:110',
        'horas/Latin/Psalterium/Psalmorum/Psalm111:__preamble:111',
        'horas/Latin/Psalterium/Psalmorum/Psalm129:__preamble:129',
        'horas/Latin/Psalterium/Psalmorum/Psalm131:__preamble:131'
      ]);

      // 1955-01-06: Epiphany keeps its Sanctoral antiphons at both major
      // hours, while concurrence leaves Jan 6 Vespers on Epiphany's own side
      // and the fifth psalm slot alone is overridden to Psalm 116.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-06', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        'horas/Latin/Sancti/01-06:Ant Laudes:4',
        'horas/Latin/Sancti/01-06:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-06', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Vespera:1',
        'horas/Latin/Sancti/01-06:Ant Vespera:2',
        'horas/Latin/Sancti/01-06:Ant Vespera:3',
        'horas/Latin/Sancti/01-06:Ant Vespera:4',
        'horas/Latin/Sancti/01-06:Ant Vespera:5'
      ]);
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-06', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        'horas/Latin/Sancti/01-06:Ant Laudes:4',
        'horas/Latin/Sancti/01-06:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Vespera:1',
        'horas/Latin/Sancti/01-06:Ant Vespera:2',
        'horas/Latin/Sancti/01-06:Ant Vespera:3',
        'horas/Latin/Sancti/01-06:Ant Vespera:4',
        'horas/Latin/Sancti/01-06:Ant Vespera:5'
      ]);
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-13', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);

      // 1955-01-07: Holy Family keeps its temporal office ownership at
      // Vespers, and because this is the day's own second Vespers the psalmody
      // antiphons come from `Ant Vespera 3`, not the first-Vespers set.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-07', 'vespers')).toEqual([
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:1',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:2',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:3',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:4',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:5'
      ]);
      expectPsalmRefs(psalmodyAt(reduced, '2024-01-07', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm109:__preamble:109',
        'horas/Latin/Psalterium/Psalmorum/Psalm112:__preamble:112',
        'horas/Latin/Psalterium/Psalmorum/Psalm121:__preamble:121',
        'horas/Latin/Psalterium/Psalmorum/Psalm126:__preamble:126',
        'horas/Latin/Psalterium/Psalmorum/Psalm147:__preamble:147'
      ]);

      // 1955-01-13: the Baptism office inherits Epiphany by `ex Sancti/01-06`,
      // so proper antiphon ownership remains on the lead minor-hour slot as
      // well as at Lauds and Vespers.
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'prime')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'terce')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'sext')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        '-',
        '-'
      ]);
      expectAntiphonRefs(psalmodyAt(reduced, '2024-01-13', 'none')).toEqual([
        'horas/Latin/Sancti/01-06:Ant Laudes:5',
        '-',
        '-'
      ]);

      // 1960-01-06: Epiphany minor hours use the Sunday/festal `Tridentinum`
      // tables from Psalmi minor, while proper-minor-hours replaces the lead
      // antiphon with the feast's own `Ant Laudes` selector. Vespers office
      // ownership stays with Epiphany itself because the current I-class feast
      // outranks Holy Family's first Vespers at concurrence.
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-01', 'lauds')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Laudes:1',
        'horas/Latin/Sancti/01-01:Ant Laudes:2',
        'horas/Latin/Sancti/01-01:Ant Laudes:3',
        'horas/Latin/Sancti/01-01:Ant Laudes:4',
        'horas/Latin/Sancti/01-01:Ant Laudes:5'
      ]);
      expectAntiphonRefs(psalmodyAt(roman1960, '2024-01-01', 'vespers')).toEqual([
        'horas/Latin/Sancti/01-01:Ant Vespera:1',
        'horas/Latin/Sancti/01-01:Ant Vespera:2',
        'horas/Latin/Sancti/01-01:Ant Vespera:3',
        'horas/Latin/Sancti/01-01:Ant Vespera:4',
        'horas/Latin/Sancti/01-01:Ant Vespera:5'
      ]);
      expectPsalmRefs(psalmodyAt(roman1960, '2024-01-01', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm109:__preamble:109',
        'horas/Latin/Psalterium/Psalmorum/Psalm110:__preamble:110',
        'horas/Latin/Psalterium/Psalmorum/Psalm111:__preamble:111',
        'horas/Latin/Psalterium/Psalmorum/Psalm129:__preamble:129',
        'horas/Latin/Psalterium/Psalmorum/Psalm131:__preamble:131'
      ]);
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'prime'),
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        ['53', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'terce'),
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'sext'),
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-06', 'none'),
        'horas/Latin/Sancti/01-06:Ant Laudes:5',
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
      expectPsalmRefs(psalmodyAt(roman1960, '2024-01-06', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);

      // 1960-01-07: Holy Family keeps its temporal proper antiphons at Lauds
      // and its own second-Vespers psalmody (`Ant Vespera 3`); Prime follows
      // the festal `Prima Festis` row while Terce/Sext/None keep the Sunday
      // Tridentinum ranges.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'prime'),
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:1',
        ['53', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'terce'),
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:2',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'sext'),
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:3',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-07', 'none'),
        'horas/Latin/Tempora/Epi1-0:Ant Laudes:5',
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
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:1',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:2',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:3',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:4',
        'horas/Latin/Tempora/Epi1-0:Ant Vespera 3:5'
      ]);
      expectPsalmRefs(psalmodyAt(roman1960, '2024-01-07', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm109:__preamble:109',
        'horas/Latin/Psalterium/Psalmorum/Psalm112:__preamble:112',
        'horas/Latin/Psalterium/Psalmorum/Psalm121:__preamble:121',
        'horas/Latin/Psalterium/Psalmorum/Psalm126:__preamble:126',
        'horas/Latin/Psalterium/Psalmorum/Psalm147:__preamble:147'
      ]);

      // 1960-01-13: the post-Epiphany Sunday keeps Epiphany's Lauds/Vespers
      // proper antiphons and the festal minor-hour Tridentinum tables.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'prime'),
        'horas/Latin/Sancti/01-06:Ant Laudes:1',
        ['53', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'terce'),
        'horas/Latin/Sancti/01-06:Ant Laudes:2',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'sext'),
        'horas/Latin/Sancti/01-06:Ant Laudes:3',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-13', 'none'),
        'horas/Latin/Sancti/01-06:Ant Laudes:5',
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
      expectPsalmRefs(psalmodyAt(roman1960, '2024-01-13', 'vespers')).toEqual([
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:1',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:2',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:3',
        'horas/Latin/Psalterium/Psalmi/Psalmi major:Day0 Vespera:4',
        'horas/Latin/Psalterium/Psalmorum/Psalm116:__preamble:116'
      ]);

      // 1960-01-14 checkpoint: ordinary Sunday after Epiphany continues to
      // use the Sunday Tridentinum minor-hour tables, including the split
      // Psalm 118 ranges and the `Psalmi minor:Tridentinum ... #antiphon`
      // ownership that keeps this date out of the current Phase 2 antiphon
      // fix path. The later block after psalmody still comes from Minor
      // Special on Sundays, not from the empty Ordinarium compound heading.
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'prime'),
        'horas/Latin/Psalterium/Psalmi/Psalmi minor:Tridentinum:Prima Dominica#antiphon',
        ['53', '117', '118(1-16)', '118(17-32)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'terce'),
        'horas/Latin/Psalterium/Psalmi/Psalmi minor:Tridentinum:Tertia Dominica#antiphon',
        ['118(33-48)', '118(49-64)', '118(65-80)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'sext'),
        'horas/Latin/Psalterium/Psalmi/Psalmi minor:Tridentinum:Sexta Dominica#antiphon',
        ['118(81-96)', '118(97-112)', '118(113-128)']
      );
      expectMinorHour(
        psalmodyAt(roman1960, '2024-01-14', 'none'),
        'horas/Latin/Psalterium/Psalmi/Psalmi minor:Tridentinum:Nona Dominica#antiphon',
        ['118(129-144)', '118(145-160)', '118(161-176)']
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'terce', 'chapter'),
        'horas/Latin/Psalterium/Special/Minor Special:Dominica Tertia'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'terce', 'responsory'),
        'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Tertia'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'terce', 'versicle'),
        'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Tertia'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'terce', 'oration'),
        'horas/Latin/Tempora/Epi2-0:Oratio'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'sext', 'chapter'),
        'horas/Latin/Psalterium/Special/Minor Special:Dominica Sexta'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'sext', 'responsory'),
        'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Sexta'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'sext', 'versicle'),
        'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Sexta'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'sext', 'oration'),
        'horas/Latin/Tempora/Epi2-0:Oratio'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'none', 'chapter'),
        'horas/Latin/Psalterium/Special/Minor Special:Dominica Nona'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'none', 'responsory'),
        'horas/Latin/Psalterium/Special/Minor Special:Responsory breve Dominica Nona'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'none', 'versicle'),
        'horas/Latin/Psalterium/Special/Minor Special:Versum Dominica Nona'
      );
      expectSingleRef(
        slotAt(roman1960, '2024-01-14', 'none', 'oration'),
        'horas/Latin/Tempora/Epi2-0:Oratio'
      );
    },
    240_000
  );

  it('locks the January Roman Matins source seam and the 1955 Jan 6/7 minor-hour later-block refs', async () => {
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

    for (const engine of [reduced, roman1960]) {
      const jan6Matins = engine.resolveDayOfficeSummary('2024-01-06').hours.matins;
      expect(jan6Matins?.slots.incipit?.kind).toBe('empty');
      expect(jan6Matins?.slots.invitatory?.kind).toBe('matins-invitatorium');
      if (jan6Matins?.slots.invitatory?.kind === 'matins-invitatorium') {
        expect(jan6Matins.slots.invitatory.source.kind).toBe('suppressed');
      }
      expect(jan6Matins?.slots.hymn?.kind).toBe('empty');

      const jan6Nocturns = matinsNocturnsAt(engine, '2024-01-06');
      expect(jan6Nocturns).toHaveLength(3);
      expectAntiphonRefs(jan6Nocturns[0]?.psalmody ?? []).toEqual([
        'horas/Latin/Sancti/01-06:Ant Matutinum:1',
        'horas/Latin/Sancti/01-06:Ant Matutinum:2',
        'horas/Latin/Sancti/01-06:Ant Matutinum:3'
      ]);
      expectPsalmRefs(jan6Nocturns[0]?.psalmody ?? []).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm28:__preamble',
        'horas/Latin/Psalterium/Psalmorum/Psalm45:__preamble',
        'horas/Latin/Psalterium/Psalmorum/Psalm46:__preamble'
      ]);

      const jan13Matins = engine.resolveDayOfficeSummary('2024-01-13').hours.matins;
      expect(jan13Matins?.slots.incipit?.kind).toBe('empty');
      expect(jan13Matins?.slots.invitatory?.kind).toBe('matins-invitatorium');
      if (jan13Matins?.slots.invitatory?.kind === 'matins-invitatorium') {
        // `Sancti/01-13` inherits Epiphany's full base file via `ex Sancti/01-06`,
        // so the Matins omit directives stay in force at the source seam too.
        expect(jan13Matins.slots.invitatory.source.kind).toBe('suppressed');
      }
      expect(jan13Matins?.slots.hymn?.kind).toBe('empty');

      const jan13Nocturns = matinsNocturnsAt(engine, '2024-01-13');
      expect(jan13Nocturns).toHaveLength(3);
      expectAntiphonRefs(jan13Nocturns[0]?.psalmody ?? []).toEqual([
        'horas/Latin/Sancti/01-06:Ant Matutinum:1',
        'horas/Latin/Sancti/01-06:Ant Matutinum:2',
        'horas/Latin/Sancti/01-06:Ant Matutinum:3'
      ]);
      expectPsalmRefs(jan13Nocturns[0]?.psalmody ?? []).toEqual([
        'horas/Latin/Psalterium/Psalmorum/Psalm28:__preamble',
        'horas/Latin/Psalterium/Psalmorum/Psalm45:__preamble',
        'horas/Latin/Psalterium/Psalmorum/Psalm46:__preamble'
      ]);
    }

    const jan14Roman1960 = matinsNocturnsAt(roman1960, '2024-01-14');
    expect(jan14Roman1960).toHaveLength(1);
    expect(jan14Roman1960[0]?.psalmody).toHaveLength(9);
    expectAntiphonRefs(jan14Roman1960[0]?.psalmody ?? []).toEqual([
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:1',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:2',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:3',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:6',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:7',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:8',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:11',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:12',
      'horas/Latin/Psalterium/Psalmi/Psalmi matutinum:Day0:13'
    ]);
    expectPsalmRefs(jan14Roman1960[0]?.psalmody ?? []).toEqual([
      'horas/Latin/Psalterium/Psalmorum/Psalm1:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm2:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm3:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm8:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm9:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm9:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm9:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm9:__preamble',
      'horas/Latin/Psalterium/Psalmorum/Psalm10:__preamble'
    ]);
    expect(jan14Roman1960[0]?.versicle.reference).toEqual({
      path: 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum',
      section: 'Day0',
      selector: '14'
    });

    // 1955 Jan 6/7 later blocks: the feast files provide the Terce/Sext/None
    // chapter/responsory/versicle chain directly, so these slots should not
    // fall through to the empty Ordinarium wrapper.
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'terce', 'chapter'),
      'horas/Latin/Sancti/01-06:Capitulum Laudes'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'terce', 'responsory'),
      'horas/Latin/Sancti/01-06:Responsory Breve Tertia'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'terce', 'versicle'),
      'horas/Latin/Sancti/01-06:Versum Tertia'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'sext', 'chapter'),
      'horas/Latin/Sancti/01-06:Capitulum Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'sext', 'responsory'),
      'horas/Latin/Sancti/01-06:Responsory Breve Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'sext', 'versicle'),
      'horas/Latin/Sancti/01-06:Versum Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'none', 'chapter'),
      'horas/Latin/Sancti/01-06:Capitulum Nona'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'none', 'responsory'),
      'horas/Latin/Sancti/01-06:Responsory Breve Nona'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-06', 'none', 'versicle'),
      'horas/Latin/Sancti/01-06:Versum Nona'
    );

    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'terce', 'chapter'),
      'horas/Latin/Tempora/Epi1-0:Capitulum Laudes'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'terce', 'responsory'),
      'horas/Latin/Tempora/Epi1-0:Responsory Breve Tertia'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'terce', 'versicle'),
      'horas/Latin/Tempora/Epi1-0:Versum Tertia'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'sext', 'chapter'),
      'horas/Latin/Tempora/Epi1-0:Capitulum Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'sext', 'responsory'),
      'horas/Latin/Tempora/Epi1-0:Responsory Breve Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'sext', 'versicle'),
      'horas/Latin/Tempora/Epi1-0:Versum Sexta'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'none', 'chapter'),
      'horas/Latin/Tempora/Epi1-0:Capitulum Nona'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'none', 'responsory'),
      'horas/Latin/Tempora/Epi1-0:Responsory Breve Nona'
    );
    expectSingleRef(
      slotAt(reduced, '2024-01-07', 'none', 'versicle'),
      'horas/Latin/Tempora/Epi1-0:Versum Nona'
    );
  }, 240_000);
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

function matinsNocturnsAt(
  engine: RubricalEngine,
  date: string
) {
  const slot = engine.resolveDayOfficeSummary(date).hours.matins?.slots.psalmody;
  expect(slot?.kind).toBe('matins-nocturns');
  if (!slot || slot.kind !== 'matins-nocturns') {
    return [];
  }
  return slot.nocturns;
}

function slotAt(
  engine: RubricalEngine,
  date: string,
  hour: 'terce' | 'sext' | 'none',
  slot: 'chapter' | 'responsory' | 'versicle' | 'oration'
) {
  return engine.resolveDayOfficeSummary(date).hours[hour]?.slots[slot];
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

function expectSingleRef(
  slot: ReturnType<typeof slotAt>,
  expected: string
) {
  expect(slot?.kind).toBe('single-ref');
  if (!slot || slot.kind !== 'single-ref') {
    return;
  }
  expect(
    `${slot.ref.path}:${slot.ref.section}${slot.ref.selector ? `:${slot.ref.selector}` : ''}`
  ).toBe(expected);
}

function expectMinorHour(
  psalms: readonly PsalmAssignment[],
  antiphonRef: string,
  selectors: readonly string[]
) {
  expect(psalms).toHaveLength(selectors.length);
  expectAntiphonRefs(psalms).toEqual([
    antiphonRef,
    ...Array.from({ length: selectors.length - 1 }, () => '-')
  ]);
  expect(psalms.map((entry) => entry.psalmRef.selector)).toEqual(selectors);
}
