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

  it('renders Roman Triduum Compline from the Special Completorium block instead of the ordinary short reading', async () => {
    const expectedOpenings = {
      '2024-03-28': [
        'Vísita, quǽsumus, Dómine, habitatiónem istam, et omnes insídias inimíci ab ea longe repélle: Ángeli tui sancti hábitent in ea, qui nos in pace custódiant; et benedíctio tua sit super nos semper.'
      ],
      '2024-03-29': [
        'Vísita, quǽsumus, Dómine, habitatiónem istam, et omnes insídias inimíci ab ea longe repélle: Ángeli tui sancti hábitent in ea, qui nos in pace custódiant; et benedíctio tua sit super nos semper.'
      ],
      '2024-03-30': ['Special Completorium', '_']
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-03-28', '2024-03-29', '2024-03-30'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const compline = summary.hours.compline;
        expect(compline?.source?.kind, `${version} ${date} should keep the Triduum Compline source`).toBe(
          'triduum-special'
        );
        if (!compline) {
          continue;
        }

        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'compline',
          options: { languages: ['Latin'] }
        });

        const lines = canonicalLatinLines(composed);
        expect(
          lines.slice(0, expectedOpenings[date].length),
          `${version} ${date} should open with the source-backed Triduum Compline block`
        ).toEqual(expectedOpenings[date].map(normalizeLatin));
        expect(
          lines,
          `${version} ${date} should not fall back to the ordinary Compline short reading`
        ).not.toContain(normalizeLatin('1 Pet 5:8-9'));
        expect(
          lines,
          `${version} ${date} should not leak the ordinary short-reading citation`
        ).not.toContain(normalizeLatin('Sóbrii estóte, et vigiláte: quia adversárius vester diábolus tamquam leo rúgiens círcuit, quærens quem dévoret: cui resístite fortes in fide.')
        );
        expect(
          lines,
          `${version} ${date} should not leak the Special Completorium pre-1955 block on Thursday or Friday`
        ).not.toContain(
          normalizeLatin('Christus factus est pro nobis obédiens usque ad mortem.')
        );
      }
    }
  }, 240_000);

  it('renders Gloria omittitur immediately before the closing Triduum Matins antiphon on Holy Thursday and Good Friday', async () => {
    const expectedClosings = {
      '2024-03-28': 'Zelus domus tuæ comédit me, et oppróbria exprobrántium tibi cecidérunt super me.',
      '2024-03-29': 'Astitérunt reges terræ, et príncipes convenérunt in unum, advérsus Dóminum, et advérsus Christum ejus.'
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-03-28', '2024-03-29'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const lines = psalmodyTexts(composed).map(normalizeLatin);
        const closingAntiphonIndex = lines.lastIndexOf(normalizeLatin(expectedClosings[date]));
        expect(
          closingAntiphonIndex,
          `${version} ${date} should end the first psalm with its repeated Triduum antiphon`
        ).toBeGreaterThan(0);
        expect(
          lines[closingAntiphonIndex - 1],
          `${version} ${date} should emit Gloria omittitur before the repeated closing antiphon`
        ).toBe(normalizeLatin('Gloria omittitur'));
      }
    }
  }, 240_000);

  it('renders the Triduum Matins secret Pater Noster rubric without the ordinary benediction bundle on Holy Thursday and Good Friday', async () => {
    const secretPater = normalizeLatin('« Pater Noster » dicitur totum secreto.');
    const secretPrayer = normalizeLatin(
      'Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen.'
    );
    const ordinaryPater = normalizeLatin('« Pater Noster » dicitur secreto usque ad « Et ne nos indúcas in tentatiónem: »');
    const jube = normalizeLatin('Jube, domne, benedícere.');

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-03-28', '2024-03-29'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const lines = canonicalLatinLines(composed);
        expect(
          lines.filter((line) => line === secretPater),
          `${version} ${date} should say the fully secret Pater once before each nocturn's lessons`
        ).toHaveLength(3);
        expect(
          lines.filter((line) => line === secretPrayer),
          `${version} ${date} should include the full secretly said Pater noster exactly once at each nocturn transition`
        ).toHaveLength(3);
        expect(
          lines,
          `${version} ${date} should not keep the ordinary Matins partial-Pater rubric`
        ).not.toContain(ordinaryPater);
        expect(
          lines,
          `${version} ${date} should suppress Jube domne under Limit Benedictiones Oratio`
        ).not.toContain(jube);
      }
    }
  }, 240_000);

  it('keeps Easter Octave Versum 2 substitutions on Prime and Terce without adding a Paschaltide alleluia tail', async () => {
    const expected = normalizeLatin(
      'Hæc dies * quam fecit Dóminus: exsultémus et lætémur in ea.'
    );
    const forbidden = normalizeLatin(
      'Hæc dies * quam fecit Dóminus: exsultémus et lætémur in ea, allelúja.'
    );

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-04-01');

      for (const hour of ['prime', 'terce'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(
          sectionTexts(composed, 'chapter').map(normalizeLatin),
          `${version} ${hour} should keep the inherited Pasc0-0 Versum 2 text verbatim`
        ).toEqual([expected]);
        expect(
          canonicalLatinLines(composed),
          `${version} ${hour} should not append an extra alleluia to Hæc dies`
        ).not.toContain(forbidden);
      }
    }
  }, 240_000);

  it('wraps Easter Octave one-alone Roman minor-hour orations with the source-backed prelude and conclusion lines', async () => {
    const orationPrelude = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Orémus.')
    ] as const;
    const primeCollect = normalizeLatin(
      'Dómine Deus omnípotens, qui ad princípium hujus diéi nos perveníre fecísti: tua nos hódie salva virtúte; ut in hac die ad nullum declinémus peccátum, sed semper ad tuam justítiam faciéndam nostra procédant elóquia, dirigántur cogitatiónes et ópera.'
    );
    const temporalCollect = normalizeLatin(
      'Deus, qui Ecclésiam tuam novo semper fœtu multíplicas: concéde fámulis tuis; ut sacraméntum vivéndo téneant, quod fide percepérunt.'
    );
    const primeOrationTail = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Benedicámus Dómino.'),
      normalizeLatin('Deo grátias.')
    ] as const;
    const minorHourConclusion = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Benedicámus Dómino.'),
      normalizeLatin('Deo grátias.'),
      normalizeLatin('Fidélium ánimæ per misericórdiam Dei requiéscant in pace.'),
      normalizeLatin('Amen.')
    ] as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-04-02');

      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });
      expect(
        sectionTexts(prime, 'oration').map(normalizeLatin).slice(0, orationPrelude.length),
        `${version} Prime should still open the one-alone oration with Domine exaudi / Oremus`
      ).toEqual(orationPrelude);
      expect(
        sectionTexts(prime, 'oration').map(normalizeLatin)[orationPrelude.length],
        `${version} Prime should use the ordinary Prima collect under the one-alone Easter-Octave shape`
      ).toBe(primeCollect);
      expect(
        sectionTexts(prime, 'oration').map(normalizeLatin).slice(-primeOrationTail.length),
        `${version} Prime should keep the one-alone post-oration Benedicamus bridge`
      ).toEqual(primeOrationTail);

      for (const hour of ['terce', 'sext', 'none'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(
          sectionTexts(composed, 'oration').map(normalizeLatin).slice(0, orationPrelude.length),
          `${version} ${hour} should still open the one-alone oration with Domine exaudi / Oremus`
        ).toEqual(orationPrelude);
        expect(
          sectionTexts(composed, 'oration').map(normalizeLatin)[orationPrelude.length],
          `${version} ${hour} should keep the Easter-Octave temporal collect under the one-alone wrapper`
        ).toBe(temporalCollect);
        expect(
          sectionTexts(composed, 'conclusion').map(normalizeLatin),
          `${version} ${hour} should emit the one-alone minor-hour conclusion block after the collect`
        ).toEqual(minorHourConclusion);
      }
    }
  }, 240_000);

  it('renders the Easter Octave Prime Martyrologium tail after the one-alone oration bridge', async () => {
    const expectedHeading = normalizeLatin(
      'Tértio Nonas Aprílis Luna vicésima tértia Anno Dómini 2024'
    );
    const expectedConclmart = normalizeLatin(
      'Et álibi aliórum plurimórum sanctórum Mártyrum et Confessórum, atque sanctárum Vírginum.'
    );
    const expectedPretiosa = normalizeLatin('Pretiósa in conspéctu Dómini.');

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-04-02');
      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });

      const slotOrder = prime.sections.map((section) => section.slot);
      expect(
        slotOrder.indexOf('martyrology'),
        `${version} Prime should continue into the Martyrologium after the oration bridge`
      ).toBeGreaterThan(slotOrder.indexOf('oration'));

      const martyrologyLines = sectionTexts(prime, 'martyrology').map(normalizeLatin);
      expect(
        martyrologyLines[0],
        `${version} Prime should open the Martyrologium tail with the next day's lunar-date heading`
      ).toBe(expectedHeading);
      expect(
        martyrologyLines,
        `${version} Prime should include the common Martyrologium conclusion`
      ).toContain(expectedConclmart);
      expect(
        martyrologyLines,
        `${version} Prime should continue from the Martyrologium into Pretiosa`
      ).toContain(expectedPretiosa);
    }
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

  it('opens January 6 and January 13 Roman Matins directly at Nocturn I when the inherited Epiphany omit rules suppress the wrapper block', async () => {
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
        expect(composed.sections[0]?.type, `${version} ${date} should start at the nocturn heading`).toBe('heading');
        expect(composed.sections[0]?.heading).toEqual({ kind: 'nocturn', ordinal: 1 });
        expect(composed.sections[1]?.slot, `${version} ${date} should move straight into psalmody`).toBe('psalmody');
        const earlyLines = composed.sections
          .slice(0, 2)
          .flatMap((section) => section.lines.map(renderLatinText))
          .join('\n');

        expect(
          earlyLines,
          `suppressed invitatory leaked Psalm 94 content for ${version} ${date}`
        ).not.toContain('Veníte, exsultémus Dómino');
        expect(earlyLines, `${version} ${date} should still open from the Epiphany first nocturn`).toContain(
          'Afférte Dómino'
        );
      }
    }
  }, 240_000);

  it('renders the January 6 and January 13 Roman Matins first nocturn from the Epiphany antiphon block', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-01-06', '2024-01-13'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const lines = psalmodyTexts(composed).map(normalizeLatin);
        expect(lines[0], `${version} ${date} first nocturn opening antiphon`).toBe(
          normalizeLatin('Afférte Dómino * fílii Dei, adoráte Dóminum in aula sancta ejus.')
        );
        expect(lines, `${version} ${date} is missing Psalm 28 at the first nocturn boundary`).toContain(
          normalizeLatin('Psalmus 28 [1]')
        );
        expect(lines, `${version} ${date} is missing Psalm 45 at the first nocturn boundary`).toContain(
          normalizeLatin('Psalmus 45 [2]')
        );
        expect(lines, `${version} ${date} is missing Psalm 46 at the first nocturn boundary`).toContain(
          normalizeLatin('Psalmus 46 [3]')
        );
        expect(lines, `${version} ${date} still starts the first nocturn from the late Epiphany tail`).not.toContain(
          normalizeLatin('Psalmus 95 [1]')
        );
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

  it('keeps the Passiontide Psalm 94 responsorial split and Gloria omission before the hymn across the Roman families', async () => {
    for (const version of PHASE_3_ROMAN_HANDLES.filter((handle) => handle !== 'Divino Afflatu - 1954')) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-03-17');
      const matins = summary.hours.matins;
      expect(matins).toBeDefined();
      if (!matins) continue;

      expect(summary.celebration.source, `${version} 2024-03-17 should stay temporal for the invitatory seam`).toBe(
        'temporal'
      );
      expect(matins.slots.invitatory?.kind).toBe('matins-invitatorium');
      if (matins.slots.invitatory?.kind === 'matins-invitatorium') {
        expect(matins.slots.invitatory.source.kind).toBe('season');
        expect(matins.slots.invitatory.source.reference.selector).toBe('Passio');
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

      const invitatory = composed.sections[1];
      expect(invitatory?.slot).toBe('invitatory');
      const invitatoryLines = invitatory?.lines.map(renderLatinText) ?? [];
      expect(invitatoryLines[8], `${version} 2024-03-17 should split Psalm 94 at the caret marker`).toBe(
        'Sicut in exacerbatióne secúndum diem tentatiónis in desérto: ubi tentavérunt me patres vestri, probavérunt et vidérunt ópera mea.'
      );
      expect(
        invitatoryLines[9],
        `${version} 2024-03-17 should repeat only the post-asterisk invitatory refrain after the split`
      ).toBe('Nolíte obduráre corda vestra.');
      expect(
        invitatoryLines[12],
        `${version} 2024-03-17 should render the omitted Gloria rubric before the final antiphon`
      ).toBe('Gloria omittitur');
      expect(
        invitatoryLines[13],
        `${version} 2024-03-17 should still end the invitatory with the full antiphon`
      ).toBe('Hódie, si vocem Dómini audiéritis, * Nolíte obduráre corda vestra.');
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

  it('renders the January 14 Roman Matins nocturn versicle as the full V./R. pair selected from the psalter seam', async () => {
    for (const [version, expectedLines] of [
      [
        'Reduced - 1955',
        ['Memor fui nocte nóminis tui, Dómine.', 'Et custodívi legem tuam.']
      ],
      [
        'Rubrics 1960 - 1960',
        ['Prævenérunt óculi mei ad te dilúculo.', 'Ut meditárer elóquia tua, Dómine.']
      ]
    ] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-14');
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      const versicle = composed.sections.find((section) => section.slot === 'versicle');
      expect(versicle, `${version} 2024-01-14 is missing the Matins nocturn versicle`).toBeDefined();
      expect((versicle?.lines ?? []).map((line) => line.marker), `${version} 2024-01-14 versicle markers`).toEqual([
        'V.',
        'R.'
      ]);
      expect((versicle?.lines ?? []).map(renderLatinText), `${version} 2024-01-14 versicle pair`).toEqual(
        expectedLines
      );
    }
  }, 240_000);

  it('reopens the January 14 1960 split Psalm 9 segments with the expected Gloria and antiphon boundary', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');
    const summary = engine.resolveDayOfficeSummary('2024-01-14');
    const composed = composeHour({
      corpus: resolvedCorpus.index,
      summary,
      version: engine.version,
      hour: 'matins',
      options: { languages: ['Latin'] }
    });

    const lines = psalmodyTexts(composed).map(normalizeLatin);
    const secondSegmentHeading = lines.indexOf(normalizeLatin('Psalmus 9(12-21) [6]'));
    expect(
      secondSegmentHeading,
      'Rubrics 1960 - 1960 2024-01-14 is missing the second split Psalm 9 heading'
    ).toBeGreaterThan(0);
    expect(lines.slice(secondSegmentHeading - 5, secondSegmentHeading + 2)).toEqual([
      normalizeLatin('9:11 Et sperent in te qui novérunt nomen tuum: * quóniam non dereliquísti quæréntes te, Dómine.'),
      normalizeLatin('Glória Patri, et Fílio, * et Spirítui Sancto.'),
      normalizeLatin('Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'),
      normalizeLatin('Sedísti super thronum qui júdicas justítiam.'),
      normalizeLatin('Exsúrge, Dómine, * non præváleat homo.'),
      normalizeLatin('Psalmus 9(12-21) [6]'),
      normalizeLatin('9:12 Psállite Dómino, qui hábitat in Sion: * annuntiáte inter gentes stúdia ejus:')
    ]);
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

  it('renders the 1955 January minor-hour hymn endings from the selected January doxology source', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const [date, firstLine] of [
      ['2024-01-01', 'Jesu, tibi sit glória,'],
      ['2024-01-06', 'Jesu, tibi sit glória,'],
      ['2024-01-07', 'Jesu, tuis obédiens'],
      ['2024-01-13', 'Jesu, tibi sit glória,']
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(normalizeLatin(firstLineOfLastHymnStanza(composed)), `${date} ${hour} hymn doxology`).toBe(
          normalizeLatin(firstLine)
        );
      }
    }
  }, 240_000);

  it('renders the 1960 January minor-hour hymn endings from the selected January doxology source', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');

    for (const [date, firstLine] of [
      ['2024-01-01', 'Jesu, tibi sit glória,'],
      ['2024-01-06', 'Jesu, tibi sit glória,'],
      ['2024-01-07', 'Jesu, tuis obédiens'],
      ['2024-01-13', 'Jesu, tibi sit glória,']
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(normalizeLatin(firstLineOfLastHymnStanza(composed)), `${date} ${hour} hymn doxology`).toBe(
          normalizeLatin(firstLine)
        );
      }
    }
  }, 240_000);

  it('renders 1955 January minor-hour explicit antiphons with shortened openings and full closing repeats', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const [date, expectations] of [
      [
        '2024-01-06',
        [
          ['Ante lucíferum génitus.', 'Ante lucíferum génitus, et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.'],
          ['Venit lumen tuum.', 'Venit lumen tuum Jerúsalem, et glória Dómini super te orta est, et ambulábunt gentes in lúmine tuo, allelúja.'],
          ['Apértis thesáuris suis.', 'Apértis thesáuris suis obtulérunt Magi Dómino aurum, thus, et myrrham, allelúja.'],
          ['Stella ista.', 'Stella ista sicut flamma corúscat, et Regem regum Deum demónstrat: Magi eam vidérunt, et magno Regi múnera obtulérunt.']
        ]
      ],
      [
        '2024-01-07',
        [
          ['Post tríduum.', 'Post tríduum invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.'],
          ['Dixit mater Jesu.', 'Dixit mater Jesu ad illum: Fili, quid fecísti nobis sic? Ecce pater tuus et ego doléntes quærebámus te.'],
          ['Descéndit Jesus.', 'Descéndit Jesus cum eis, et venit Názareth, et erat súbditus illis.'],
          ['Et dicébant:', 'Et dicébant: Unde huic sapiéntia hæc, et virtútes? Nonne hic est fabri fílius?']
        ]
      ]
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const [hour, [opening, closing]] of [
        ['prime', expectations[0]],
        ['terce', expectations[1]],
        ['sext', expectations[2]],
        ['none', expectations[3]]
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const antiphons = psalmodyAntiphons(composed);
        expect(normalizeLatin(antiphons[0] ?? ''), `${date} ${hour} opening antiphon`).toBe(normalizeLatin(opening));
        expect(normalizeLatin(antiphons.at(-1) ?? ''), `${date} ${hour} closing antiphon`).toBe(normalizeLatin(closing));
      }
    }
  }, 240_000);

  it('renders 1955 January major-hour explicit antiphons as full opening and closing pairs', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const [date, hours] of [
      [
        '2024-01-06',
        {
          lauds: [
            'Ante lucíferum génitus, * et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.',
            'Ante lucíferum génitus, et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.'
          ],
          vespers: [
            'Ante lucíferum génitus, * et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.',
            'Ante lucíferum génitus, et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.'
          ]
        }
      ],
      [
        '2024-01-07',
        {
          lauds: [
            'Post tríduum * invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.',
            'Post tríduum invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.'
          ],
          vespers: [
            'Post tríduum * invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.',
            'Post tríduum invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.'
          ]
        }
      ]
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const hour of ['lauds', 'vespers'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const antiphons = psalmodyAntiphons(composed);
        expect(normalizeLatin(antiphons[0] ?? ''), `${date} ${hour} opening antiphon`).toBe(
          normalizeLatin(hours[hour][0])
        );
        expect(normalizeLatin(antiphons[1] ?? ''), `${date} ${hour} first closing antiphon`).toBe(
          normalizeLatin(hours[hour][1])
        );
      }
    }
  }, 240_000);

  it('renders 1960 January proper-minor-hours antiphons from the winning office', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');

    for (const [date, expectations] of [
      [
        '2024-01-06',
        [
          'Ante lucíferum génitus, * et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.',
          'Venit lumen tuum * Jerúsalem, et glória Dómini super te orta est, et ambulábunt gentes in lúmine tuo, allelúja.',
          'Apértis thesáuris suis * obtulérunt Magi Dómino aurum, thus, et myrrham, allelúja.',
          'Stella ista * sicut flamma corúscat, et Regem regum Deum demónstrat: Magi eam vidérunt, et magno Regi múnera obtulérunt.'
        ]
      ],
      [
        '2024-01-07',
        [
          'Post tríduum * invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.',
          'Dixit mater Jesu * ad illum: Fili, quid fecísti nobis sic? Ecce pater tuus et ego doléntes quærebámus te.',
          'Descéndit Jesus * cum eis, et venit Názareth, et erat súbditus illis.',
          'Et dicébant: * Unde huic sapiéntia hæc, et virtútes? Nonne hic est fabri fílius?'
        ]
      ],
      [
        '2024-01-13',
        [
          'Ante lucíferum génitus, * et ante sǽcula, Dóminus Salvátor noster hódie mundo appáruit.',
          'Venit lumen tuum * Jerúsalem, et glória Dómini super te orta est, et ambulábunt gentes in lúmine tuo, allelúja.',
          'Apértis thesáuris suis * obtulérunt Magi Dómino aurum, thus, et myrrham, allelúja.',
          'Stella ista * sicut flamma corúscat, et Regem regum Deum demónstrat: Magi eam vidérunt, et magno Regi múnera obtulérunt.'
        ]
      ]
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const [hour, expected] of [
        ['prime', expectations[0]],
        ['terce', expectations[1]],
        ['sext', expectations[2]],
        ['none', expectations[3]]
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${date} ${hour} antiphon`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('renders Jan 14 Sunday Tridentinum minor-hour antiphons from the keyed psalter surface', async () => {
    for (const [version, expectations] of [
      [
        'Reduced - 1955',
        {
          primeOpening: 'Allelúja.',
          primeClosing:
            'Allelúja, confitémini Dómino, quóniam in sǽculum misericórdia ejus, allelúja, allelúja.',
          terce:
            'Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.',
          sexta:
            'Allelúja, * tuus sum ego, salvum me fac, Dómine, allelúja, allelúja.',
          none:
            'Allelúja, * fáciem tuam, Dómine, illúmina super servum tuum, allelúja, allelúja.'
        }
      ],
      [
        'Rubrics 1960 - 1960',
        {
          prime:
            'Allelúja, * confitémini Dómino, quóniam in sǽculum misericórdia ejus, allelúja, allelúja.',
          terce:
            'Allelúja, * deduc me, Dómine, in sémitam mandatórum tuórum, allelúja, allelúja.',
          sexta:
            'Allelúja, * tuus sum ego, salvum me fac, Dómine, allelúja, allelúja.',
          none:
            'Allelúja, * fáciem tuam, Dómine, illúmina super servum tuum, allelúja, allelúja.'
        }
      ]
    ] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-14');

      for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const antiphons = psalmodyAntiphons(composed);
        if (version === 'Reduced - 1955' && hour === 'prime') {
          expect(normalizeLatin(antiphons[0] ?? ''), `${version} ${hour} opening antiphon`).toBe(
            normalizeLatin(expectations.primeOpening)
          );
          expect(normalizeLatin(antiphons.at(-1) ?? ''), `${version} ${hour} closing antiphon`).toBe(
            normalizeLatin(expectations.primeClosing)
          );
          continue;
        }

        const expected =
          hour === 'prime'
            ? expectations.prime
            : hour === 'terce'
              ? expectations.terce
              : hour === 'sext'
                ? expectations.sexta
                : expectations.none;
        expect(normalizeLatin(antiphons[0] ?? ''), `${version} ${hour} opening antiphon`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('renders Jan 14 psalter major wrappers with repeated closes plus the next opening antiphon', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-01-14');

      for (const [hour, expected] of [
        [
          'lauds',
          [
            'Allelúja, * Dóminus regnávit, decórem índuit, allelúja, allelúja.',
            'Allelúja, Dóminus regnávit, decórem índuit, allelúja, allelúja.',
            'Jubiláte * Deo omnis terra, allelúja.',
            'Jubiláte Deo omnis terra, allelúja.',
            'Benedícam te * in vita mea, Dómine: et in nómine tuo levábo manus meas, allelúja.',
          ]
        ],
        [
          'vespers',
          [
            'Dixit Dóminus * Dómino meo: Sede a dextris meis.',
            'Dixit Dóminus Dómino meo: Sede a dextris meis.',
            'Magna ópera Dómini: * exquisíta in omnes voluntátes ejus.',
            'Magna ópera Dómini: exquisíta in omnes voluntátes ejus.',
            'Qui timet Dóminum, * in mandátis ejus cupit nimis.',
          ]
        ]
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        expect(psalmodyAntiphons(composed).map(normalizeLatin).slice(0, 5), `${version} ${hour} antiphon order`).toEqual(
          expected.map(normalizeLatin)
        );
      }
    }
  }, 240_000);

  it('keeps January Roman Vespers later-block headings on the source-backed Day0 and Psalm116 refs', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const [date, sliceStart, expected] of [
        [
          '2024-01-01',
          12,
          [
            'O admirábile commércium: Creátor géneris humáni, animátum corpus sumens, de Vírgine nasci dignátus est; et procédens homo sine sémine, largítus est nobis suam Deitátem.',
            'Quando natus es * ineffabíliter ex Vírgine, tunc implétæ sunt Scriptúræ: sicut plúvia in vellus descendísti, ut salvum fáceres genus humánum: te laudámus, Deus noster.',
            'Psalmus 110 [2]'
          ]
        ],
        [
          '2024-01-07',
          12,
          [
            'Post tríduum invenérunt Jesum in templo sedéntem in médio doctórum, audiéntem illos, et interrogántem eos.',
            'Dixit mater Jesu * ad illum: Fili, quid fecísti nobis sic? Ecce pater tuus et ego doléntes quærebámus te.',
            'Psalmus 110 [2]'
          ]
        ],
        [
          '2024-01-06',
          54,
          [
            'Mária et flúmina benedícite Dómino: hymnum dícite fontes Dómino, allelúja.',
            'Stella ista * sicut flamma corúscat, et Regem regum Deum demónstrat: Magi eam vidérunt, et magno Regi múnera obtulérunt.',
            'Psalmus 116 [5]'
          ]
        ],
        [
          '2024-01-13',
          54,
          [
            'Mária et flúmina benedícite Dómino: hymnum dícite fontes Dómino, allelúja.',
            'Stella ista * sicut flamma corúscat, et Regem regum Deum demónstrat: Magi eam vidérunt, et magno Regi múnera obtulérunt.',
            'Psalmus 116 [5]'
          ]
        ]
      ] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'vespers',
          options: { languages: ['Latin'] }
        });

        expect(
          psalmodyTexts(composed).slice(sliceStart, sliceStart + expected.length).map(normalizeLatin),
          `${version} ${date} later-block Vespers boundary`
        ).toEqual(expected.map(normalizeLatin));
      }
    }
  }, 240_000);

  it('keeps Jan 14 1960 minor hours in chapter-responsory-versicle-oration order after psalmody', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');
    const summary = engine.resolveDayOfficeSummary('2024-01-14');

    for (const [hour, chapterCitation, versicleOpening] of [
      ['terce', '1 Joann. 4:16', 'Ego dixi: Dómine, miserére mei.'],
      ['sext', 'Gal 6:2', 'Dóminus regit me, et nihil mihi déerit.'],
      ['none', '1 Cor 6:20', 'Ab occúltis meis munda me, Dómine.']
    ] as const) {
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      const sectionOrder = composed.sections.map((section) => section.slot);
      const psalmodyIndex = sectionOrder.indexOf('psalmody');
      expect(psalmodyIndex, `${hour} is missing psalmody`).toBeGreaterThanOrEqual(0);
      expect(
        sectionOrder.slice(psalmodyIndex, psalmodyIndex + 5),
        `${hour} later-block order`
      ).toEqual(['psalmody', 'chapter', 'responsory', 'versicle', 'oration']);

      expect(
        sectionTexts(composed, 'chapter')[0]?.trim(),
        `${hour} chapter citation`
      ).toBe(chapterCitation);
      expect(
        sectionTexts(composed, 'versicle')[0]?.trim(),
        `${hour} versicle opening`
      ).toBe(versicleOpening);
      expect(
        sectionTexts(composed, 'oration')[0]?.trim(),
        `${hour} oration opening`
      ).toBe(
        'Omnípotens sempitérne Deus, qui cæléstia simul et terréna moderáris: supplicatiónes pópuli tui cleménter exáudi; et pacem tuam nostris concéde tempóribus.'
      );
    }
  }, 240_000);

  it('keeps Reduced 1955 Jan 6/7 minor hours in chapter-responsory-versicle-oration order after psalmody', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const [date, hour, chapterCitation, responsoryOpening, versicleOpening] of [
      ['2024-01-06', 'terce', 'Isa 60:1', 'Reges Tharsis et ínsulæ múnera ófferent, * Allelúja, allelúja.', 'Omnes de Saba vénient, allelúja.'],
      ['2024-01-06', 'sext', 'Isa 60:4', 'Omnes de Saba vénient, * Allelúja, allelúja.', 'Adoráte Dóminum, allelúja.'],
      ['2024-01-06', 'none', 'Isa 60:6', 'Adoráte Dóminum, * Allelúja, allelúja.', 'Adoráte Deum, allelúja.'],
      ['2024-01-07', 'terce', 'Luc 2:51', 'Propter nos egénus factus est * Cum esset dives.', 'Dóminus vias suas docébit nos.'],
      ['2024-01-07', 'sext', 'Rom 5:19', 'Dóminus vias suas * Docébit nos.', 'Pauper sum ego, et in labóribus a juventúte mea.'],
      ['2024-01-07', 'none', 'Phil 2:7', 'Pauper sum ego, * Et in labóribus a juventúte mea.', 'Ponam univérsos fílios tuos doctos a Dómino.']
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      const sectionOrder = composed.sections.map((section) => section.slot);
      const psalmodyIndex = sectionOrder.indexOf('psalmody');
      expect(psalmodyIndex, `${date} ${hour} is missing psalmody`).toBeGreaterThanOrEqual(0);
      expect(
        sectionOrder.slice(psalmodyIndex, psalmodyIndex + 5),
        `${date} ${hour} later-block order`
      ).toEqual(['psalmody', 'chapter', 'responsory', 'versicle', 'oration']);

      expect(
        sectionTexts(composed, 'chapter')[0]?.trim(),
        `${date} ${hour} chapter citation`
      ).toBe(chapterCitation);
      expect(
        sectionTexts(composed, 'responsory')[0]?.trim(),
        `${date} ${hour} responsory opening`
      ).toBe(responsoryOpening);
      expect(
        sectionTexts(composed, 'versicle')[0]?.trim(),
        `${date} ${hour} versicle opening`
      ).toBe(versicleOpening);
    }
  }, 240_000);
});

function renderLatinText(line: { readonly texts: Record<string, readonly { readonly type: string; readonly value?: string }[]> }): string {
  return (line.texts.Latin ?? [])
    .map((run) => ('value' in run && run.value ? run.value : ''))
    .join('');
}

function firstLineOfLastHymnStanza(
  composed: ReturnType<typeof composeHour>
): string {
  const hymn = composed.sections.find((section) => section.slot === 'hymn');
  expect(hymn, `${composed.hour} is missing the hymn section`).toBeDefined();
  const hymnLines = hymn?.lines.map(renderLatinText).filter((line) => line !== '_') ?? [];
  expect(hymnLines.length, `${composed.hour} hymn should contain at least one stanza`).toBeGreaterThan(0);
  const lastAmen = hymnLines.lastIndexOf('Amen.');
  const stanzaStart = lastAmen >= 4 ? lastAmen - 4 : Math.max(0, hymnLines.length - 5);
  return hymnLines[stanzaStart] ?? '';
}

function firstPsalmodyAntiphon(
  composed: ReturnType<typeof composeHour>
): string {
  const antiphonLine = psalmodyAntiphonLines(composed)[0];
  expect(antiphonLine, `${composed.hour} is missing the opening antiphon line`).toBeDefined();
  return antiphonLine ? renderLatinText(antiphonLine) : '';
}

function psalmodyAntiphons(
  composed: ReturnType<typeof composeHour>
): readonly string[] {
  return psalmodyAntiphonLines(composed).map(renderLatinText);
}

function psalmodyTexts(
  composed: ReturnType<typeof composeHour>
): readonly string[] {
  const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
  expect(psalmody, `${composed.hour} is missing the psalmody section`).toBeDefined();
  return psalmody?.lines.map(renderLatinText).filter((line) => line !== '_') ?? [];
}

function sectionTexts(
  composed: ReturnType<typeof composeHour>,
  slot: 'chapter' | 'responsory' | 'versicle' | 'oration' | 'conclusion'
): readonly string[] {
  const section = composed.sections.find((candidate) => candidate.slot === slot);
  expect(section, `${composed.hour} is missing the ${slot} section`).toBeDefined();
  return section?.lines.map(renderLatinText).filter((line) => line !== '_') ?? [];
}

function psalmodyAntiphonLines(
  composed: ReturnType<typeof composeHour>
) {
  const psalmody = composed.sections.find((section) => section.slot === 'psalmody');
  expect(psalmody, `${composed.hour} is missing the psalmody section`).toBeDefined();
  return psalmody?.lines.filter((line) => line.marker === 'Ant.') ?? [];
}

function canonicalLatinLines(
  composed: ReturnType<typeof composeHour>
): readonly string[] {
  return composed.sections
    .flatMap((section) => section.lines.map(renderLatinText))
    .map((line) => normalizeLatin(line.trim()))
    .filter((line) => line.length > 0);
}

function normalizeLatin(text: string): string {
  return text.normalize('NFC');
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
