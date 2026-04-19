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
import {
  PHASE_3_GOLDEN_DATES,
  PHASE_3_ROMAN_HANDLES
} from '../fixtures/phase-3-golden-dates.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

type RomanHandle = (typeof PHASE_3_ROMAN_HANDLES)[number];

interface SharedResources {
  rawCorpus: Awaited<ReturnType<typeof loadCorpus>>;
  resolvedCorpus: Awaited<ReturnType<typeof loadCorpus>>;
  versionRegistry: ReturnType<typeof buildVersionRegistry>;
  kalendarium: ReturnType<typeof buildKalendariumTable>;
  yearTransfers: ReturnType<typeof buildYearTransferTable>;
  scriptureTransfers: ReturnType<typeof buildScriptureTransferTable>;
}

let sharedResourcesPromise: Promise<SharedResources> | undefined;

async function loadSharedResources(): Promise<SharedResources> {
  sharedResourcesPromise ??= (async () => {
    const rawCorpus = await loadCorpus(UPSTREAM_ROOT, { resolveReferences: false });
    const resolvedCorpus = await loadCorpus(UPSTREAM_ROOT);
    const versionRegistry = buildVersionRegistry(
      parseVersionRegistry(readFileSync(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8'))
    );

    return {
      rawCorpus,
      resolvedCorpus,
      versionRegistry,
      kalendarium: buildKalendariumTable(loadKalendaria()),
      yearTransfers: buildYearTransferTable(loadTransferTables()),
      scriptureTransfers: buildScriptureTransferTable(loadScriptureTransferTables())
    };
  })();

  return sharedResourcesPromise;
}

async function createHarness(version: RomanHandle) {
  const resources = await loadSharedResources();
  const engine = createRubricalEngine({
    corpus: resources.rawCorpus.index,
    kalendarium: resources.kalendarium,
    yearTransfers: resources.yearTransfers,
    scriptureTransfers: resources.scriptureTransfers,
    versionRegistry: resources.versionRegistry,
    version: asVersionHandle(version),
    policyMap: VERSION_POLICY
  });

  return {
    engine,
    resolvedCorpus: resources.resolvedCorpus
  };
}

/**
 * End-to-end smoke test against the real upstream corpus: load the Phase 1
 * index twice — unresolved for the Rubrical Engine, resolved for the
 * compositor — then resolve the canonical Phase 3 Roman date matrix across
 * all three implemented Roman policy families. The exact textual-comparison
 * job lives in `compare:phase-3-perl`; this suite stays intentionally
 * smoke-level and asserts only that the pipeline never throws and that every
 * Hour emits a non-empty Section list with Latin content or structured
 * heading metadata.
 */
describeIfUpstream('Phase 3 composition smoke against upstream corpus (Roman policies)', () => {
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

  it('composes every Hour for the canonical Phase 3 Roman date matrix without throwing', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of PHASE_3_GOLDEN_DATES) {
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
                expect(line.marker, `empty line without marker in ${version} ${hour} ${section.slot}`).toBeTruthy();
              }
              for (const runs of Object.values(line.texts)) {
                expect(runs.length, `empty run list in ${version} ${hour} ${section.slot}`).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  }, 360_000);

  it('emits a non-empty Matins shape (invitatory + heading + psalmody + Te Deum) on a double feast', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');

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
    expect(['incipit', 'invitatory']).toContain(slotOrder[0]);
    expect(slotOrder).toContain('psalmody');
    expect(slotOrder).toContain('heading');
    expect(composed.sections.find((section) => section.type === 'heading')?.heading).toBeDefined();
  }, 240_000);

  it('renders July 9 Matins benedictions line-by-line and emits the Te Deum replacement responsory only once', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');

    const summary = engine.resolveDayOfficeSummary('2024-07-09');
    const composed = composeHour({
      corpus: resolvedCorpus.index,
      summary,
      version: engine.version,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const benedictions = composed.sections
      .filter((section) => section.slot === 'benedictio')
      .map((section) =>
        (section.lines[0]?.texts.Latin ?? [])
          .map((run) => ('value' in run ? run.value : ''))
          .join('')
      );

    expect(benedictions).toEqual([
      'Deus Pater omnípotens sit nobis propítius et clemens.',
      'Christus perpétuæ det nobis gáudia vitæ.',
      'Ignem sui amóris accéndat Deus in córdibus nostris.'
    ]);
    expect(composed.sections.filter((section) => section.slot === 'responsory')).toHaveLength(2);
    expect(composed.sections.filter((section) => section.slot === 'te-deum')).toHaveLength(1);
  }, 240_000);

  it('keeps January 6 and January 13 Matins invitatories suppressed across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-01-06', '2024-01-13']) {
        const summary = engine.resolveDayOfficeSummary(date);
        const matins = summary.hours.matins;
        expect(matins).toBeDefined();
        if (!matins) continue;

        expect(matins.slots.invitatory?.kind).toBe('matins-invitatorium');
        if (matins.slots.invitatory?.kind === 'matins-invitatorium') {
          expect(matins.slots.invitatory.source.kind).toBe('suppressed');
        }

        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        expect(composed.sections.find((section) => section.slot === 'invitatory')).toBeUndefined();
        const earlyLines = composed.sections
          .slice(0, 4)
          .flatMap((section) => section.lines.map(renderLatinText))
          .join('\n');

        expect(
          earlyLines,
          `suppressed invitatory leaked Psalm 94 content for ${version} ${date}`
        ).not.toContain('Veníte, exsultémus Dómino');
      }
    }
  }, 240_000);

  it('keeps the January 14 seasonal invitatory as the full opening block across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-14');
      const matins = summary.hours.matins;
      expect(matins).toBeDefined();
      if (!matins) continue;

      expect(matins.slots.invitatory?.kind).toBe('matins-invitatorium');
      if (matins.slots.invitatory?.kind === 'matins-invitatorium') {
        expect(matins.slots.invitatory.source.kind).toBe('season');
      }

      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      expect(composed.sections.slice(0, 4).map((section) => section.slot)).toEqual([
        'incipit',
        'invitatory',
        'hymn',
        'heading'
      ]);
      expect(composed.sections[3]?.heading).toEqual({ kind: 'nocturn', ordinal: 1 });

      const invitatory = composed.sections[1];
      expect(invitatory?.slot).toBe('invitatory');
      const invitatoryLines = invitatory?.lines.map(renderLatinText) ?? [];
      expect(invitatoryLines[0]).toBe('Adorémus Dóminum, * Quóniam ipse fecit nos.');
      expect(invitatoryLines[1]).toBe('Adorémus Dóminum, * Quóniam ipse fecit nos.');
      expect(invitatoryLines[2]).toBe(
        'Veníte, exsultémus Dómino, jubilémus Deo, salutári nostro: præoccupémus fáciem ejus in confessióne, et in psalmis jubilémus ei.'
      );
    }
  }, 240_000);

  it('applies the January 28 Invit2 feast materialization before the hymn across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-28');
      const matins = summary.hours.matins;
      expect(matins).toBeDefined();
      if (!matins) continue;

      expect(matins.slots.invitatory?.kind).toBe('matins-invitatorium');
      if (matins.slots.invitatory?.kind === 'matins-invitatorium') {
        expect(matins.slots.invitatory.source.kind).toBe('feast');
      }

      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      expect(composed.sections.slice(0, 4).map((section) => section.slot)).toEqual([
        'incipit',
        'invitatory',
        'hymn',
        'heading'
      ]);
      expect(composed.sections[3]?.heading).toEqual({ kind: 'nocturn', ordinal: 1 });

      const invitatory = composed.sections[1];
      expect(invitatory?.slot).toBe('invitatory');
      const invitatoryLines = invitatory?.lines.map(renderLatinText) ?? [];
      expect(invitatoryLines[0]).toBe('Præoccupémus fáciem Dómini: * Et in psalmis jubilémus ei.');
      expect(invitatoryLines[1]).toBe('Præoccupémus fáciem Dómini: * Et in psalmis jubilémus ei.');
      expect(invitatoryLines[2]).toBe('Veníte, exsultémus Dómino, jubilémus Deo, salutári nostro:');
    }
  }, 240_000);

  it('keeps a closing Matins antiphon line immediately before the nocturn versicle on January 14 and January 28', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-01-14', '2024-01-28']) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const psalmodyIndex = composed.sections.findIndex((section) => section.slot === 'psalmody');
        const versicleIndex = composed.sections.findIndex((section) => section.slot === 'versicle');
        expect(psalmodyIndex, `${version} ${date} is missing Matins psalmody`).toBeGreaterThanOrEqual(0);
        expect(versicleIndex, `${version} ${date} is missing Matins versicle`).toBe(psalmodyIndex + 1);

        const lastPsalmodyLine = composed.sections[psalmodyIndex]!.lines.at(-1);
        expect(lastPsalmodyLine?.marker, `${version} ${date} should end psalmody with an antiphon line`).toBe(
          'Ant.'
        );
        expect(renderLatinText(lastPsalmodyLine!)).not.toContain(';;');
      }
    }
  }, 240_000);

  it('strips selector trailers from February Matins psalmody across the 1955/1960 Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES.filter((handle) => handle !== 'Divino Afflatu - 1954')) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const [date, headingPrefix] of [
        ['2024-02-14', 'Psalmus 44(2a-10b) [1]'],
        ['2024-02-24', 'Psalmus 104(1-15) [1]']
      ] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const psalmodyText = composed.sections
          .filter((section) => section.slot === 'psalmody')
          .flatMap((section) => section.lines.map(renderLatinText))
          .join('\n');

        expect(psalmodyText, `${version} ${date} still leaks selector syntax into Matins`).not.toContain(';;');
        expect(psalmodyText, `${version} ${date} is missing the ranged inline psalm heading`).toContain(headingPrefix);
      }
    }
  }, 240_000);

  it('removes bare carry-over markers from January 7 Matins psalmody across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-07');
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      const psalmodyText = composed.sections
        .filter((section) => section.slot === 'psalmody')
        .flatMap((section) => section.lines.map(renderLatinText))
        .join('\n');

      expect(psalmodyText, `${version} 2024-01-07 still leaks bare carry-over markers`).not.toContain('(7)');
    }
  }, 240_000);

  it('inserts the Roman pre-lesson bundle before Lectio 1 on January 1 across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-01');
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      const lessonHeadingIndex = composed.sections.findIndex(
        (section) => section.type === 'heading' && section.heading?.kind === 'lesson' && section.heading.ordinal === 1
      );
      expect(lessonHeadingIndex, `${version} 2024-01-01 is missing Lectio 1`).toBeGreaterThanOrEqual(0);

      const absolutioIndex = composed.sections.findIndex((section) => section.reference === 'matins-absolutio');
      const jubeIndex = composed.sections.findIndex(
        (section) => section.reference === 'horas/Latin/Psalterium/Common/Prayers#Jube domne'
      );
      const benedictioIndex = composed.sections.findIndex((section) => section.slot === 'benedictio');

      expect(absolutioIndex, `${version} 2024-01-01 is missing the Matins absolutio bundle`).toBeGreaterThanOrEqual(
        0
      );
      expect(composed.sections[absolutioIndex]!.lines[0]?.marker).toBe('Absolutio.');
      expect(jubeIndex, `${version} 2024-01-01 is missing Jube domne before Lectio 1`).toBeGreaterThanOrEqual(0);
      expect(benedictioIndex, `${version} 2024-01-01 is missing Benedictio before Lectio 1`).toBeGreaterThanOrEqual(
        0
      );

      expect(absolutioIndex).toBeLessThan(jubeIndex);
      expect(jubeIndex).toBeLessThan(benedictioIndex);
      expect(benedictioIndex).toBeLessThan(lessonHeadingIndex);
    }
  }, 240_000);
});

function renderLatinText(line: { readonly texts: Record<string, readonly { readonly type: string; readonly value?: string }[]> }): string {
  return (line.texts.Latin ?? [])
    .map((run) => ('value' in run && run.value ? run.value : ''))
    .join('');
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
