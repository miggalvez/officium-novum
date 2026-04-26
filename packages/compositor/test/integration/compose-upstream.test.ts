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

  it('keeps the self-contained Triduum Lauds oration without the ordinary major-hour wrapper', async () => {
    const expectedOpening = [
      normalizeLatin('Christus factus est pro nobis obédiens usque ad mortem.'),
      normalizeLatin('secreto'),
      normalizeLatin(
        'Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen.'
      )
    ] as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-03-28');
      const lauds = summary.hours.lauds;

      expect(lauds?.slots.conclusion?.kind, `${version} Triduum Lauds should omit Conclusio`).toBe(
        'empty'
      );

      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'lauds',
        options: { languages: ['Latin'], joinLaudsToMatins: false }
      });

      const oration = sectionTexts(composed, 'oration').map(normalizeLatin);
      expect(oration.slice(0, expectedOpening.length), `${version} should open with the proper Triduum oration`).toEqual(
        expectedOpening
      );
      expect(
        composed.sections.some((section) => section.slot === 'conclusion'),
        `${version} should not append the ordinary major-hour conclusion`
      ).toBe(false);
      expect(oration).not.toContain(
        normalizeLatin('Et dato signo a Superiore omnes surgunt et discedunt.')
      );
    }
  }, 240_000);

  it('lets simplified Triduum minor hours pass from psalmody to the proper oration', async () => {
    const expectedOpeningByDate = {
      '2024-03-28': normalizeLatin('Christus factus est pro nobis obédiens usque ad mortem.'),
      '2024-03-29': normalizeLatin(
        'Christus factus est pro nobis obédiens usque ad mortem, mortem autem crucis.'
      ),
      '2024-03-30': normalizeLatin(
        'Christus factus est pro nobis obédiens usque ad mortem, mortem autem crucis: propter quod et Deus exaltávit illum, et dedit illi nomen, quod est super omne nomen.'
      )
    } as const;
    const ordinaryShortReadings = [
      normalizeLatin('Zach 8:19'),
      normalizeLatin('Jer 17:14'),
      normalizeLatin('Rom 13:8'),
      normalizeLatin('1 Pet 1:17-19')
    ] as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-03-28', '2024-03-29', '2024-03-30'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);

        for (const hour of ['prime', 'terce', 'sext', 'none'] as const) {
          const structure = summary.hours[hour];
          expect(
            structure?.slots.chapter?.kind,
            `${version} ${date} ${hour} should omit the ordinary chapter slot`
          ).toBe('empty');
          expect(
            structure?.slots.responsory?.kind,
            `${version} ${date} ${hour} should omit the ordinary responsory slot`
          ).toBe('empty');
          expect(
            structure?.slots.versicle?.kind,
            `${version} ${date} ${hour} should omit the ordinary versicle slot`
          ).toBe('empty');

          const composed = composeHour({
            corpus: resolvedCorpus.index,
            summary,
            version: engine.version,
            hour,
            options: { languages: ['Latin'] }
          });

          expect(
            sectionTexts(composed, 'oration').map(normalizeLatin)[0],
            `${version} ${date} ${hour} should open the proper Triduum oration immediately after psalmody`
          ).toBe(expectedOpeningByDate[date]);
          expect(
            canonicalLatinLines(composed),
            `${version} ${date} ${hour} should not leak ordinary minor-hour short readings`
          ).not.toEqual(expect.arrayContaining(ordinaryShortReadings));
        }
      }
    }
  }, 240_000);

  it('prepends simplified Triduum Vespers suppression notices before the psalmody office', async () => {
    const expectedByDate = {
      '2024-03-28': normalizeLatin(
        'Vesperæ ab iis qui Missæ vespertinæ in Cena Domini intersunt, hodie non dicuntur.'
      ),
      '2024-03-29': normalizeLatin(
        'Vesperæ ab iis qui solemni Actioni liturgicæ postmeridianæ intersunt, hodie non dicuntur.'
      )
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-03-28', '2024-03-29'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'vespers',
          options: { languages: ['Latin'] }
        });
        const lines = canonicalLatinLines(composed);

        expect(lines[0], `${version} ${date} Vespers should open with the suppression notice`).toBe(
          expectedByDate[date]
        );
        expect(
          composed.sections.map((section) => section.slot).slice(0, 2),
          `${version} ${date} Vespers should prepend Prelude Vespera before ordinary psalmody`
        ).toEqual(['vespers-suppression', 'psalmody']);
        expect(
          lines.some((line) => line.includes(normalizeLatin('Cálicem * salutáris accípiam'))),
          `${version} ${date} Vespers should continue into the ordinary Triduum antiphon`
        ).toBe(true);
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

  it('renders Reduced 1955 Sunday minor-hour later blocks and ordinary collect wrapper', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');
    const summary = engine.resolveDayOfficeSummary('2024-01-28');
    const expectedByHour = {
      terce: {
        responsory: normalizeLatin('Inclína cor meum, Deus, * In testimónia tua.'),
        versicle: [
          normalizeLatin('Ego dixi: Dómine, miserére mei.'),
          normalizeLatin('Sana ánimam meam, quia peccávi tibi.')
        ]
      },
      sext: {
        responsory: normalizeLatin('In ætérnum, Dómine, * Pérmanet verbum tuum.'),
        versicle: [
          normalizeLatin('Dóminus regit me, et nihil mihi déerit.'),
          normalizeLatin('In loco páscuæ ibi me collocávit.')
        ]
      },
      none: {
        responsory: normalizeLatin('Clamávi in toto corde meo: * Exáudi me, Dómine.'),
        versicle: [
          normalizeLatin('Ab occúltis meis munda me, Dómine.'),
          normalizeLatin('Et ab aliénis parce servo tuo.')
        ]
      }
    } as const;
    const orationPrelude = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Orémus.')
    ] as const;
    const collect = normalizeLatin(
      'Preces pópuli tui, quǽsumus, Dómine, cleménter exáudi: ut, qui juste pro peccátis nostris afflígimur, pro tui nóminis glória misericórditer liberémur.'
    );
    const minorHourConclusion = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Benedicámus Dómino.'),
      normalizeLatin('Deo grátias.'),
      normalizeLatin('Fidélium ánimæ per misericórdiam Dei requiéscant in pace.'),
      normalizeLatin('Amen.')
    ] as const;

    for (const [hour, expected] of Object.entries(expectedByHour) as Array<
      [keyof typeof expectedByHour, (typeof expectedByHour)[keyof typeof expectedByHour]]
    >) {
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      expect(sectionTexts(composed, 'responsory').map(normalizeLatin)[0]).toBe(expected.responsory);
      expect(sectionTexts(composed, 'versicle').map(normalizeLatin)).toEqual(expected.versicle);
      expect(sectionTexts(composed, 'oration').map(normalizeLatin).slice(0, orationPrelude.length)).toEqual(
        orationPrelude
      );
      expect(sectionTexts(composed, 'oration').map(normalizeLatin)[orationPrelude.length]).toBe(collect);
      expect(sectionTexts(composed, 'conclusion').map(normalizeLatin)).toEqual(minorHourConclusion);
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
    const expectedFirstNotice = normalizeLatin(
      'Romæ natális beáti Xysti Primi, Papæ et Mártyris; qui, tempóribus Hadriáni Imperatóris, summa cum laude rexit Ecclésiam, ac demum, sub Antoníno Pio, ut sibi Christum lucrifáceret, libénter mortem sustínuit temporálem.'
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
      const martyrology = prime.sections.find((section) => section.slot === 'martyrology');
      expect(martyrology, `${version} Prime should expose a Martyrologium section`).toBeDefined();
      expect(
        renderLatinText(martyrology!.lines[1]!),
        `${version} Prime should preserve the separator line before the Martyrologium notices`
      ).toBe('_');
      expect(
        martyrology!.lines[2]!.marker,
        `${version} Prime should emit the Martyrologium notices as responsorial ` + '`r.`' + ` lines`
      ).toBe('r.');
      expect(
        normalizeLatin(renderLatinText(martyrology!.lines[2]!)),
        `${version} Prime should keep the first Martyrologium notice after the separator`
      ).toBe(expectedFirstNotice);
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

  it('renders De Officio Capituli immediately after the Easter Octave Prime Martyrologium', async () => {
    const expectedOpening = normalizeLatin('Deus in adjutórium meum inténde.');

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
      const capituliIndex = slotOrder.indexOf('de-officio-capituli');
      expect(
        capituliIndex,
        `${version} Prime should continue into De Officio Capituli after the Martyrologium`
      ).toBeGreaterThan(slotOrder.indexOf('martyrology'));

      const capituli = prime.sections.find((section) => section.slot === 'de-officio-capituli');
      expect(capituli, `${version} Prime should expose a De Officio Capituli section`).toBeDefined();
      expect(
        capituli!.lines[0]!.marker,
        `${version} Prime should keep the versicle marker on Deus in adjutorium`
      ).toBe('V.');
      expect(
        normalizeLatin(renderLatinText(capituli!.lines[0]!)),
        `${version} Prime should open De Officio Capituli with Deus in adjutorium`
      ).toBe(expectedOpening);
    }
  }, 240_000);

  it('preserves the source-backed guillemets on the Easter Octave Prime secret Pater Noster rubric', async () => {
    const expectedRubric = normalizeLatin(
      '« Pater Noster » dicitur secreto usque ad « Et ne nos indúcas in tentatiónem: »'
    );

    for (const [version, date] of [
      ['Reduced - 1955', '2024-04-05'],
      ['Rubrics 1960 - 1960', '2024-04-05']
    ] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(date);
      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });

      const capituli = prime.sections.find((section) => section.slot === 'de-officio-capituli');
      expect(capituli, `${version} Prime should expose a De Officio Capituli section`).toBeDefined();

      const capituliLines = capituli?.lines.map(renderLatinText).map(normalizeLatin) ?? [];
      expect(
        capituliLines,
        `${version} Prime should preserve the source-backed guillemets on the secret Pater Noster rubric`
      ).toContain(expectedRubric);
    }
  }, 240_000);

  it('renders Easter Octave Vespers Magnificat and its repeated antiphon before the oration', async () => {
    const expectedCanticleOpening = [
      normalizeLatin('Canticum B. Mariæ Virginis'),
      normalizeLatin('Luc. 1:46-55'),
      normalizeLatin('1:46 Magníficat + * ánima mea Dóminum.')
    ] as const;
    const expectedRepeatedAntiphon = normalizeLatin(
      'Vidéte manus meas et pedes meos, quia ego ipse sum, allelúja, allelúja.'
    );

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-04-02');
      const vespers = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      const slotOrder = vespers.sections.map((section) => section.slot);
      const canticleIndex = slotOrder.indexOf('canticle-ad-magnificat');
      expect(
        canticleIndex,
        `${version} Vespers should expose Magnificat between the antiphon and the oration`
      ).toBeGreaterThan(slotOrder.indexOf('antiphon-ad-magnificat'));
      expect(
        canticleIndex,
        `${version} Vespers should place Magnificat before the oration`
      ).toBeLessThan(slotOrder.indexOf('oration'));

      const canticleLines = sectionTexts(vespers, 'canticle-ad-magnificat').map(normalizeLatin);
      const canticle = vespers.sections.find((section) => section.slot === 'canticle-ad-magnificat');
      expect(canticle, `${version} Vespers should expose a Magnificat section`).toBeDefined();
      expect(
        canticleLines.slice(0, expectedCanticleOpening.length),
        `${version} Vespers should open the Magnificat section with the source-backed heading and first verse`
      ).toEqual(expectedCanticleOpening);
      expect(
        canticle?.lines.at(-1)?.marker,
        `${version} Vespers should keep the Ant. marker on the repeated Magnificat antiphon`
      ).toBe('Ant.');
      expect(
        canticleLines.at(-1),
        `${version} Vespers should repeat the Magnificat antiphon after the canticle`
      ).toBe(expectedRepeatedAntiphon);
    }
  }, 240_000);

  it('wraps Easter Octave Vespers orations with the source-backed Domine exaudi / Oremus prelude', async () => {
    const orationPrelude = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Orémus.')
    ] as const;
    const expectedCollects = {
      'Reduced - 1955': normalizeLatin(
        'Deus, qui solemnitáte pascháli, mundo remédia contulísti: pópulum tuum, quǽsumus, cælésti dono proséquere; ut et perféctam libertátem cónsequi mereátur, et ad vitam profíciat sempitérnam.'
      ),
      'Rubrics 1960 - 1960': normalizeLatin(
        'Deus, qui Ecclésiam tuam novo semper fœtu multíplicas: concéde fámulis tuis; ut sacraméntum vivéndo téneant, quod fide percepérunt.'
      )
    } as const;
    const dates = {
      'Reduced - 1955': '2024-04-01',
      'Rubrics 1960 - 1960': '2024-04-02'
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(dates[version]);
      const vespers = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      const orationLines = sectionTexts(vespers, 'oration').map(normalizeLatin);
      expect(
        orationLines.slice(0, orationPrelude.length),
        `${version} Vespers should restore the ordinary Domine exaudi / Oremus prelude before the collect`
      ).toEqual(orationPrelude);
      expect(
        orationLines[orationPrelude.length],
        `${version} Vespers should keep the source-backed Easter-Octave collect after the restored prelude`
      ).toBe(expectedCollects[version]);
    }
  }, 240_000);

  it('restores the ordinary Easter Octave Vespers conclusion block after the collect', async () => {
    const expectedConclusion = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Benedicámus Dómino, allelúja, allelúja.'),
      normalizeLatin('Deo grátias, allelúja, allelúja.'),
      normalizeLatin('Fidélium ánimæ per misericórdiam Dei requiéscant in pace.'),
      normalizeLatin('Amen.')
    ] as const;
    const dates = {
      'Reduced - 1955': '2024-04-01',
      'Rubrics 1960 - 1960': '2024-04-02'
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(dates[version]);
      const vespers = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      expect(
        sectionTexts(vespers, 'conclusion').map(normalizeLatin),
        `${version} Vespers should keep the ordinary post-oration conclusion block`
      ).toEqual(expectedConclusion);
    }
  }, 240_000);

  it('uses the ordinary Benedicamus conclusion after the Easter octave', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-05-09');
      const vespers = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      const conclusionLines = sectionTexts(vespers, 'conclusion').map(normalizeLatin);
      expect(conclusionLines, `${version} Ascension Vespers conclusion`).toContain(
        normalizeLatin('Benedicámus Dómino.')
      );
      expect(conclusionLines, `${version} Ascension Vespers conclusion`).not.toContain(
        normalizeLatin('Benedicámus Dómino, allelúja, allelúja.')
      );
    }
  }, 240_000);

  it('keeps bare Deo gratias chapter responses unseasoned in Paschaltide', async () => {
    const cases = [
      ['Reduced - 1955', '2024-05-09', 'terce'],
      ['Reduced - 1955', '2024-05-09', 'sext'],
      ['Reduced - 1955', '2024-05-09', 'none'],
      ['Reduced - 1955', '2024-05-09', 'vespers'],
      ['Rubrics 1960 - 1960', '2024-05-09', 'vespers'],
      ['Rubrics 1960 - 1960', '2024-05-19', 'sext'],
      ['Rubrics 1960 - 1960', '2024-05-19', 'none']
    ] as const;

    for (const [version, date, hour] of cases) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      const chapterLines = sectionTexts(composed, 'chapter').map(normalizeLatin);
      expect(chapterLines, `${version} ${date} ${hour} chapter`).toContain(
        normalizeLatin('Deo grátias.')
      );
      expect(chapterLines, `${version} ${date} ${hour} chapter`).not.toContain(
        normalizeLatin('Deo grátias, allelúja.')
      );
    }
  }, 240_000);

  it('keeps source-backed Paschaltide minor-hour short responsories', async () => {
    const cases = [
      [
        'Reduced - 1955',
        '2024-05-09',
        'terce',
        'Ascéndit Deus in jubilatióne, * Allelúja, allelúja.'
      ],
      [
        'Reduced - 1955',
        '2024-05-09',
        'sext',
        'Ascéndens Christus in altum, * Allelúja, allelúja.'
      ],
      [
        'Reduced - 1955',
        '2024-05-09',
        'none',
        'Ascéndo ad Patrem meum, et Patrem vestrum, * Allelúja, allelúja.'
      ],
      [
        'Rubrics 1960 - 1960',
        '2024-05-19',
        'sext',
        'Spíritus Paráclitus, * Allelúja, allelúja.'
      ],
      [
        'Rubrics 1960 - 1960',
        '2024-05-19',
        'none',
        'Repléti sunt omnes Spíritu Sancto, * Allelúja, allelúja.'
      ]
    ] as const;

    for (const [version, date, hour, expectedResponsory] of cases) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      expect(
        sectionTexts(composed, 'responsory').map(normalizeLatin),
        `${version} ${date} ${hour} responsory`
      ).toContain(normalizeLatin(expectedResponsory));
    }
  }, 240_000);

  it('keeps the source-backed Psalm 99 half-verse structure in Easter Octave Lauds', async () => {
    const expectedHalfVerse = normalizeLatin(
      '99:3 Pópulus ejus, et oves páscuæ ejus: ‡ introíte portas ejus in confessióne, * átria ejus in hymnis: confitémini illi.'
    );
    const flattenedHalfVerse = normalizeLatin(
      '99:3 Pópulus ejus, et oves páscuæ ejus: * introíte portas ejus in confessióne, átria ejus in hymnis: confitémini illi.'
    );
    const dates = {
      'Reduced - 1955': '2024-04-01',
      'Rubrics 1960 - 1960': '2024-04-02'
    } as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary(dates[version]);
      const lauds = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'lauds',
        options: { languages: ['Latin'], joinLaudsToMatins: false }
      });

      const lines = psalmodyTexts(lauds).map(normalizeLatin);
      expect(
        lines,
        `${version} Lauds should preserve the corpus half-verse marker at Psalm 99:3`
      ).toContain(expectedHalfVerse);
      expect(
        lines,
        `${version} Lauds should not flatten the Psalm 99 half-verse boundary to a single * split`
      ).not.toContain(flattenedHalfVerse);
    }
  }, 240_000);

  it('keeps the source-backed Psalm 115 half-verse structure in Roman Vespers', async () => {
    const expectedHalfVerse = normalizeLatin(
      '115:7 Dirupísti víncula mea: ‡ tibi sacrificábo hóstiam laudis, * et nomen Dómini invocábo.'
    );
    const flattenedHalfVerse = normalizeLatin(
      '115:7 Dirupísti víncula mea: * tibi sacrificábo hóstiam laudis, et nomen Dómini invocábo.'
    );

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-05-30');
      const vespers = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      const lines = psalmodyTexts(vespers).map(normalizeLatin);
      expect(
        lines,
        `${version} Vespers should preserve the corpus half-verse marker at Psalm 115:7`
      ).toContain(expectedHalfVerse);
      expect(
        lines,
        `${version} Vespers should not flatten the Psalm 115 half-verse boundary to a single * split`
      ).not.toContain(flattenedHalfVerse);
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

  it('uses the late-Advent Invit Adv3 antiphon on the third and fourth Sundays', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-12-15', '2024-12-22'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
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
        const invitatory = composed.sections.find((section) => section.slot === 'invitatory');
        const invitatoryLines = invitatory?.lines.map(renderLatinText) ?? [];
        expect(invitatoryLines[0], `${version} ${date} Matins invitatory`).toBe(
          'Prope est jam Dóminus, * Veníte, adorémus.'
        );
      }
    }
  }, 240_000);

  it('uses the Advent Sunday Matins psalter antiphons instead of ordinary Day0', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-12-15', '2024-12-22'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });

        const expected =
          version === 'Reduced - 1955'
            ? 'Véniet ecce Rex.'
            : 'Véniet ecce Rex * excélsus cum potestáte magna ad salvándas gentes, allelúja.';
        expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${version} ${date} Matins psalmody`).toBe(
          normalizeLatin(expected)
        );
        expect(canonicalLatinLines(composed), `${version} ${date} Matins Advent versicle`).toContain(
          normalizeLatin('Ex Sion spécies decóris ejus.')
        );
        expect(canonicalLatinLines(composed), `${version} ${date} Matins Advent versicle response`).toContain(
          normalizeLatin('Deus noster maniféste véniet.')
        );
        expect(canonicalLatinLines(composed), `${version} ${date} Matins Advent pre-lesson Pater`).toContain(
          normalizeLatin('« Pater Noster » dicitur secreto usque ad « Et ne nos indúcas in tentatiónem: »')
        );
      }
    }
  }, 240_000);

  it('uses the inherited Confessor common invitatory for C5 Matins offices', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const date of ['2024-08-19', '2024-10-04'] as const) {
        const summary = engine.resolveDayOfficeSummary(date);
        const matins = summary.hours.matins;
        expect(matins).toBeDefined();
        if (!matins) continue;

        expect(matins.slots.invitatory?.kind).toBe('matins-invitatorium');
        if (matins.slots.invitatory?.kind === 'matins-invitatorium') {
          expect(matins.slots.invitatory.source.kind).toBe('feast');
          expect(matins.slots.invitatory.source.reference).toMatchObject({
            path: 'horas/Latin/Commune/C5',
            section: 'Invit'
          });
        }

        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'matins',
          options: { languages: ['Latin'] }
        });
        const invitatory = composed.sections.find((section) => section.slot === 'invitatory');
        const invitatoryLines = invitatory?.lines.map(renderLatinText) ?? [];
        expect(invitatoryLines[0], `${version} ${date} Matins invitatory`).toBe(
          'Regem Confessórum Dóminum, * Veníte, adorémus.'
        );
      }
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

  it('reopens the February 14 Roman Matins split Psalm 44 segments with the expected Gloria and antiphon boundary', async () => {
    for (const [version, reopeningAntiphon] of [
      ['Reduced - 1955', 'Confitebúntur tibi.'],
      ['Rubrics 1960 - 1960', 'Confitebúntur tibi * pópuli Deus in ætérnum.']
    ] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-02-14');
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'matins',
        options: { languages: ['Latin'] }
      });

      const lines = psalmodyTexts(composed).map(normalizeLatin);
      const secondSegmentHeading = lines.indexOf(normalizeLatin('Psalmus 44(11-18b) [2]'));
      expect(secondSegmentHeading, `${version} 2024-02-14 is missing the second split Psalm 44 heading`).toBeGreaterThan(
        0
      );
      expect(lines.slice(secondSegmentHeading - 5, secondSegmentHeading + 2)).toEqual([
        normalizeLatin('44:10 Ástitit regína a dextris tuis in vestítu deauráto: * circúmdata varietáte.'),
        normalizeLatin('Glória Patri, et Fílio, * et Spirítui Sancto.'),
        normalizeLatin('Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'),
        normalizeLatin('Speciósus forma præ fíliis hóminum, diffúsa est grátia in lábiis tuis.'),
        normalizeLatin(reopeningAntiphon),
        normalizeLatin('Psalmus 44(11-18b) [2]'),
        normalizeLatin('44:11 Audi fília, et vide, et inclína aurem tuam: * et oblivíscere pópulum tuum et domum patris tui.')
      ]);
    }
  }, 240_000);

  it('labels the Ash Wednesday 1960 Lauds Old Testament canticle from the Psalmorum source title', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');
    const summary = engine.resolveDayOfficeSummary('2024-02-14');
    const composed = composeHour({
      corpus: resolvedCorpus.index,
      summary,
      version: engine.version,
      hour: 'lauds',
      options: { languages: ['Latin'] }
    });

    const lines = psalmodyTexts(composed).map(normalizeLatin);
    const canticleHeading = lines.indexOf(normalizeLatin('Canticum Annæ [4]'));
    expect(canticleHeading, 'Rubrics 1960 - 1960 2024-02-14 Lauds is missing the Anna canticle heading').toBeGreaterThan(
      0
    );
    expect(lines).not.toContain(normalizeLatin('Psalmus 223 [4]'));
    expect(lines).not.toContain(normalizeLatin('(Canticum Annæ * 3 Reg 2:1-16)'));
    expect(lines[canticleHeading + 1]).toBe(normalizeLatin('3 Reg 2:1-16'));
    expect(lines[canticleHeading + 2]).toBe(
      normalizeLatin('2:1 Exsultávit cor meum in Dómino, * et exaltátum est cornu meum in Deo meo.')
    );
  }, 240_000);

  it('fills the Ash Wednesday 1960 Lauds later block from the ferial Major Special sections', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');
    const summary = engine.resolveDayOfficeSummary('2024-02-14');
    const composed = composeHour({
      corpus: resolvedCorpus.index,
      summary,
      version: engine.version,
      hour: 'lauds',
      options: { languages: ['Latin'], joinLaudsToMatins: false }
    });

    expect(sectionTexts(composed, 'chapter').map(normalizeLatin)).toEqual([
      normalizeLatin(' Rom 13:12-13'),
      normalizeLatin(
        'Nox præcéssit, dies autem appropinquávit. Abiciámus ergo ópera tenebrárum, et induámur arma lucis. Sicut in die honéste ambulémus.'
      ),
      normalizeLatin('Deo grátias.')
    ]);
    expect(sectionTexts(composed, 'hymn').map(normalizeLatin).slice(0, 2)).toEqual([
      normalizeLatin('Hymnus'),
      normalizeLatin('Nox, et tenébræ, et núbila,')
    ]);
    expect(sectionTexts(composed, 'versicle').map(normalizeLatin)).toEqual([
      normalizeLatin('Repléti sumus mane misericórdia tua.'),
      normalizeLatin('Exsultávimus, et delectáti sumus.')
    ]);
    expect(sectionTexts(composed, 'preces').map(normalizeLatin).slice(0, 3)).toEqual([
      normalizeLatin('Kýrie, eléison. Christe, eléison. Kýrie, eléison.'),
      normalizeLatin(
        'Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris:'
      ),
      normalizeLatin('Et ne nos indúcas in tentatiónem:')
    ]);

    const lines = canonicalLatinLines(composed);
    const chapterIndex = lines.indexOf(normalizeLatin('Rom 13:12-13'));
    const benedictusAntiphonIndex = lines.findIndex((line) => line.includes('Cum jejunátis'));
    expect(chapterIndex).toBeGreaterThan(0);
    expect(benedictusAntiphonIndex).toBeGreaterThan(chapterIndex);
  }, 240_000);

  it('renders Ash Wednesday Roman minor-hour seasonal antiphons before the psalm heading', async () => {
    for (const [version, expectations] of [
      [
        'Reduced - 1955',
        {
          prime: ['Vivo ego.', 'Psalmus 25 [1]'],
          terce: ['Advenérunt nobis * dies pœniténtiæ ad rediménda peccáta, ad salvándas ánimas.', 'Psalmus 53 [1]'],
          sext: ['Commendémus nosmetípsos * in multa patiéntia, in jejúniis multis, per arma justítiæ.', 'Psalmus 55 [1]'],
          none: ['Per arma justítiæ * virtútis Dei commendémus nosmetípsos in multa patiéntia.', 'Psalmus 58(2-11) [1]']
        }
      ],
      [
        'Rubrics 1960 - 1960',
        {
          prime: [
            'Vivo ego * dicit Dóminus: nolo mortem peccatóris, sed ut magis convertátur et vivat.',
            'Psalmus 25 [1]'
          ],
          terce: ['Advenérunt nobis * dies pœniténtiæ ad rediménda peccáta, ad salvándas ánimas.', 'Psalmus 53 [1]'],
          sext: ['Commendémus nosmetípsos * in multa patiéntia, in jejúniis multis, per arma justítiæ.', 'Psalmus 55 [1]'],
          none: ['Per arma justítiæ * virtútis Dei commendémus nosmetípsos in multa patiéntia.', 'Psalmus 58(2-11) [1]']
        }
      ]
    ] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-02-14');

      for (const [hour, expected] of Object.entries(expectations) as Array<
        [Extract<HourName, 'prime' | 'terce' | 'sext' | 'none'>, readonly [string, string]]
      >) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });
        expect(psalmodyTexts(composed).map(normalizeLatin).slice(0, 2), `${version} ${hour}`).toEqual(
          expected.map(normalizeLatin)
        );
      }
    }
  }, 240_000);

  it('renders Reduced 1955 weekday psalter antiphons without Perl-only trailing markers', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');
    const summary = engine.resolveDayOfficeSummary('2024-06-20');

    for (const [hour, expected] of [
      ['terce', 'Quam bonus.'],
      ['vespers', 'Ecce quam bonum * et quam jucúndum habitáre fratres in unum.']
    ] as const) {
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${hour} opening antiphon`).toBe(
        normalizeLatin(expected)
      );
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

  it('keeps the commemorated Lourdes doxology off 1955 Quinquagesima Sunday hymns', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');
    const summary = engine.resolveDayOfficeSummary('2024-02-11');
    expect(summary.celebration.feastRef.path).toBe('Tempora/Quadp3-0');
    expect(summary.commemorations.some((commemoration) => commemoration.feastRef.path === 'Sancti/02-11')).toBe(
      true
    );

    for (const [hour, firstLine] of [
      ['matins', 'Præsta, Pater piíssime,'],
      ['prime', 'Deo Patri sit glória,'],
      ['terce', 'Præsta, Pater piíssime,'],
      ['sext', 'Præsta, Pater piíssime,'],
      ['none', 'Præsta, Pater piíssime,']
    ] as const) {
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour,
        options: { languages: ['Latin'] }
      });

      expect(normalizeLatin(firstLineOfLastHymnStanza(composed)), `${hour} hymn doxology`).toBe(
        normalizeLatin(firstLine)
      );
    }
  }, 240_000);

  it('applies seasonal Paschal doxology to 1955 fallback minor-hour hymns', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const date of ['2024-04-07', '2024-05-19'] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      for (const [hour, firstLine] of [
        ['prime', 'Deo Patri sit glória,'],
        ['terce', 'Deo Patri sit glória,'],
        ['sext', 'Deo Patri sit glória,'],
        ['none', 'Deo Patri sit glória,']
      ] as const) {
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

  it('renders St Joseph proper minor-hour later blocks from the office source', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-03-19');

      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });
      expect(sectionTexts(prime, 'chapter').map((line) => normalizeLatin(line).trim()), `${version} Prime chapter`).toContain(
        normalizeLatin('Sap 10:10')
      );

      for (const [hour, expected] of [
        ['terce', 'Constítuit eum * Dóminum domus suæ.'],
        ['sext', 'Magna est glória ejus * In salutári tuo.'],
        ['none', 'Justus germinábit * Sicut lílium.']
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const responsory = firstMarkedSectionLine(composed, 'responsory', 'R.br.');
        expect(normalizeLatin(renderLatinText(responsory)), `${version} ${hour} responsory`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('renders the Nativity of St John the Baptist proper minor-hour later blocks from the office source', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-06-24');

      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });
      expect(sectionTexts(prime, 'chapter').map((line) => normalizeLatin(line).trim()), `${version} Prime chapter`).toContain(
        normalizeLatin('Isa 49:7')
      );

      for (const [hour, expected] of [
        ['terce', 'Fuit homo * Missus a Deo.'],
        ['sext', 'Inter natos mulíerum * Non surréxit major.'],
        ['none', 'Elísabeth Zacharíæ * Magnum virum génuit.']
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const responsory = firstMarkedSectionLine(composed, 'responsory', 'R.br.');
        expect(normalizeLatin(renderLatinText(responsory)), `${version} ${hour} responsory`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('renders Ss Peter and Paul proper minor-hour later blocks from the office source', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-06-29');

      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });
      expect(sectionTexts(prime, 'chapter').map((line) => normalizeLatin(line).trim()), `${version} Prime chapter`).toContain(
        normalizeLatin('Act 12:11')
      );

      for (const [hour, expected] of [
        ['terce', 'In omnem terram * Exívit sonus eórum.'],
        ['sext', 'Constítues eos príncipes * Super omnem terram.'],
        ['none', 'Nimis honoráti sunt * Amíci tui, Deus.']
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const responsory = firstMarkedSectionLine(composed, 'responsory', 'R.br.');
        expect(normalizeLatin(renderLatinText(responsory)), `${version} ${hour} responsory`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('renders Precious Blood proper minor-hour later blocks from the office source', async () => {
    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-07-01');

      const prime = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });
      expect(sectionTexts(prime, 'chapter').map((line) => normalizeLatin(line).trim()), `${version} Prime chapter`).toContain(
        normalizeLatin('Heb 9:19-20')
      );

      for (const [hour, expected] of [
        ['terce', 'Redemísti nos, Dómine, * In sánguine tuo.'],
        ['sext', 'Sanguis Jesu Christi Fílii Dei * Emúndat nos.'],
        ['none', 'Christus diléxit nos, et lavit nos * In sánguine suo.']
      ] as const) {
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour,
          options: { languages: ['Latin'] }
        });

        const responsory = firstMarkedSectionLine(composed, 'responsory', 'R.br.');
        expect(normalizeLatin(renderLatinText(responsory)), `${version} ${hour} responsory`).toBe(
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

  it('renders Reduced 1955 Lauds source-backed full opening antiphons', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const [date, expected] of [
      [
        '2024-01-28',
        'Miserére * mei, Deus, et a delícto meo munda me: quia tibi soli peccávi.'
      ],
      [
        '2024-02-11',
        'Secúndum multitúdinem * miseratiónum tuárum, Dómine, dele iniquitátem meam.'
      ],
      ['2024-02-14', 'Ámplius lava me, * Dómine, ab injustítia mea.'],
      [
        '2024-02-18',
        'Cor mundum * crea in me Deus, et spíritum rectum ínnova in viscéribus meis.'
      ],
      ['2024-02-24', 'Benígne fac, Dómine, * in bona voluntáte tua Sion.'],
      [
        '2024-02-25',
        'Dómine, * lábia mea apéries, et os meum annuntiábit laudem tuam.'
      ],
      [
        '2024-03-03',
        'Fac benígne * in bona voluntáte tua, ut ædificéntur, Dómine, muri Jerúsalem.'
      ],
      [
        '2024-03-10',
        'Tunc acceptábis * sacrifícium justítiæ, si avérteris fáciem tuam a peccátis meis.'
      ],
      [
        '2024-03-17',
        'Vide, Dómine, * afflictiónem meam, quóniam eréctus est inimícus meus.'
      ],
      ['2024-03-24', 'Dóminus Deus * auxiliátor meus: et ídeo non sum confúsus.'],
      [
        '2024-03-25',
        'Fáciem meam * non avérti ab increpántibus, et conspuéntibus in me.'
      ],
      [
        '2024-03-26',
        'Vide, Dómine, * et consídera, quóniam tríbulor: velóciter exáudi me.'
      ],
      [
        '2024-03-27',
        'Líbera me * de sanguínibus, Deus, Deus meus: et exsultábit lingua mea justítiam tuam.'
      ],
      [
        '2024-04-03',
        'Angelus autem Dómini * descéndit de cælo, et accédens revólvit lápidem, et sedébat super eum, allelúja, allelúja.'
      ],
      ['2024-06-20', 'Jubiláte * in conspéctu regis Dómini.'],
      ['2024-11-05', 'Cantáte * Dómino et benedícite nómini ejus.'],
      ['2024-11-08', 'Exaltáte * Dóminum Deum nostrum, et adoráte in monte sancto ejus.'],
      [
        '2024-12-01',
        'In illa die * stillábunt montes dulcédinem, et colles fluent lac et mel, allelúja.'
      ],
      [
        '2024-12-15',
        'Véniet Dóminus, * et non tardábit, et illuminábit abscóndita tenebrárum, et manifestábit se ad omnes gentes, allelúja.'
      ],
      [
        '2024-12-22',
        'Cánite tuba * in Sion, quia prope est dies Dómini: ecce véniet ad salvándum nos, allelúja, allelúja.'
      ]
    ] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'lauds',
        options: { languages: ['Latin'] }
      });

      expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${date} Lauds opening antiphon`).toBe(
        normalizeLatin(expected)
      );
    }
  }, 240_000);

  it('renders Lenten ferial Vespers source-backed full opening antiphons', async () => {
    const cases = [
      ['2024-02-14', 'Beáti omnes * qui timent Dóminum.'],
      ['2024-03-25', 'Inclinávit Dóminus * aurem suam mihi.'],
      ['2024-03-26', 'Qui hábitas in cælis, * miserére nobis.'],
      ['2024-03-27', 'Beáti omnes * qui timent Dóminum.']
    ] as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);

      for (const [date, expected] of cases) {
        const summary = engine.resolveDayOfficeSummary(date);
        const composed = composeHour({
          corpus: resolvedCorpus.index,
          summary,
          version: engine.version,
          hour: 'vespers',
          options: { languages: ['Latin'] }
        });

        expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${version} ${date} Vespers antiphon`).toBe(
          normalizeLatin(expected)
        );
      }
    }
  }, 240_000);

  it('keeps the 1960 Tridentinum Paschal Prime antiphon on later Sundays', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');

    for (const date of ['2024-06-16', '2024-06-30', '2024-09-08', '2024-09-15', '2024-10-06'] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'prime',
        options: { languages: ['Latin'] }
      });

      expect(normalizeLatin(firstPsalmodyAntiphon(composed)), `${date} Prime antiphon`).toBe(
        normalizeLatin('Allelúja, * allelúja, allelúja')
      );
    }
  }, 240_000);

  it('emits the source-backed 1955 Vespers conclusion bridge after the collect', async () => {
    const { engine, resolvedCorpus } = await createHarness('Reduced - 1955');

    for (const date of ['2024-03-19', '2024-09-08', '2024-09-15', '2024-12-08', '2024-12-27'] as const) {
      const summary = engine.resolveDayOfficeSummary(date);
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      expect(sectionTexts(composed, 'conclusion').slice(0, 2), `${date} Vespers conclusion`).toEqual([
        'Dómine, exáudi oratiónem meam.',
        'Et clamor meus ad te véniat.'
      ]);
    }
  }, 240_000);

  it('keeps January Roman Vespers later-block headings on the source-backed proper and Psalm116 refs', async () => {
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
            'Psalmus 112 [2]'
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

  it('keeps Dec 27 Roman Vespers in chapter-hymn-versicle order after the Christmas second-Vespers psalmody', async () => {
    const expectedChapter = [
      normalizeLatin('Sir 15:1-2'),
      normalizeLatin(
        'Qui timet Deum, fáciet bona: et qui cóntinens est justítiæ, apprehéndet illam, et obviábit illi quasi mater honorificáta.'
      ),
      normalizeLatin('Deo grátias.')
    ] as const;

    for (const version of ['Reduced - 1955', 'Rubrics 1960 - 1960'] as const) {
      const { engine, resolvedCorpus } = await createHarness(version);
      const summary = engine.resolveDayOfficeSummary('2024-12-27');
      const composed = composeHour({
        corpus: resolvedCorpus.index,
        summary,
        version: engine.version,
        hour: 'vespers',
        options: { languages: ['Latin'] }
      });

      const sectionOrder = composed.sections.map((section) => section.slot);
      const psalmodyIndex = sectionOrder.indexOf('psalmody');
      expect(psalmodyIndex, `${version} Dec 27 Vespers is missing psalmody`).toBeGreaterThanOrEqual(0);
      expect(
        sectionOrder.slice(psalmodyIndex, psalmodyIndex + 4),
        `${version} Dec 27 Vespers later-block order`
      ).toEqual(['psalmody', 'chapter', 'hymn', 'versicle']);
      expect(
        sectionTexts(composed, 'chapter').map((line) => normalizeLatin(line.trim())),
        `${version} Dec 27 Vespers chapter lines`
      ).toEqual(expectedChapter);
      const hymnSection = composed.sections.find((section) => section.slot === 'hymn');
      expect(hymnSection, `${version} Dec 27 Vespers should expose a hymn section`).toBeDefined();
      const hymnLines = hymnSection?.lines.map(renderLatinText).map((line) => normalizeLatin(line.trim())) ?? [];
      expect(
        hymnLines.slice(0, 3),
        `${version} Dec 27 Vespers hymn wrapper`
      ).toEqual([
        normalizeLatin('_'),
        normalizeLatin(version === 'Reduced - 1955' ? 'Hymnus {Doxology: Nat}' : 'Hymnus'),
        normalizeLatin('Exsúltet orbis gáudiis:')
      ]);
      expect(
        hymnLines[2],
        `${version} Dec 27 Vespers hymn opening`
      ).toBe(normalizeLatin('Exsúltet orbis gáudiis:'));
      expect(
        hymnLines.at(-1),
        `${version} Dec 27 Vespers should keep the hymn-versicle separator inside the hymn block`
      ).toBe(normalizeLatin('_'));
    }
  }, 240_000);

  it('keeps Jan 14 1960 minor hours in chapter-responsory-versicle-oration order after psalmody', async () => {
    const { engine, resolvedCorpus } = await createHarness('Rubrics 1960 - 1960');
    const summary = engine.resolveDayOfficeSummary('2024-01-14');
    const orationPrelude = [
      normalizeLatin('Dómine, exáudi oratiónem meam.'),
      normalizeLatin('Et clamor meus ad te véniat.'),
      normalizeLatin('Orémus.')
    ] as const;

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
        sectionTexts(composed, 'oration').map(normalizeLatin).slice(0, orationPrelude.length),
        `${hour} oration opening`
      ).toEqual(orationPrelude);
      expect(
        sectionTexts(composed, 'oration').map(normalizeLatin)[orationPrelude.length],
        `${hour} collect`
      ).toBe(
        normalizeLatin(
          'Omnípotens sempitérne Deus, qui cæléstia simul et terréna moderáris: supplicatiónes pópuli tui cleménter exáudi; et pacem tuam nostris concéde tempóribus.'
        )
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
  expect(antiphonLine?.marker, `${composed.hour} opening antiphon marker`).toBe('Ant.');
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
  slot:
    | 'chapter'
    | 'hymn'
    | 'responsory'
    | 'versicle'
    | 'preces'
    | 'oration'
    | 'conclusion'
    | 'martyrology'
    | 'canticle-ad-magnificat'
): readonly string[] {
  const section = composed.sections.find((candidate) => candidate.slot === slot);
  expect(section, `${composed.hour} is missing the ${slot} section`).toBeDefined();
  return section?.lines.map(renderLatinText).filter((line) => line !== '_') ?? [];
}

function firstMarkedSectionLine(
  composed: ReturnType<typeof composeHour>,
  slot: 'responsory',
  marker: 'R.br.'
) {
  const section = composed.sections.find((candidate) => candidate.slot === slot);
  expect(section, `${composed.hour} is missing the ${slot} section`).toBeDefined();
  const line = section?.lines.find((candidate) => candidate.marker === marker);
  expect(line, `${composed.hour} ${slot} is missing ${marker} marker`).toBeDefined();
  return line!;
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
