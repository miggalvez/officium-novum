import { parseKalendarium } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  UnsupportedPolicyError,
  asVersionHandle,
  buildKalendariumTable,
  buildScriptureTransferTable,
  buildVersionRegistry,
  buildYearTransferTable,
  computeYearKey,
  createRubricalEngine,
  dayNameForDate,
  defaultResolveRank
} from '../src/index.js';
import { TestOfficeTextIndex } from './helpers.js';
import { makeTestPolicy } from './policy-fixture.js';

describe('createRubricalEngine', () => {
  it('resolves a day summary with temporal + sanctoral candidates and an occurrence winner', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Tempora/Pasc2-0.txt',
      ['[Officium]', 'Dominica II post Pascha', '', '[Rank]', ';;Semiduplex;;5;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/04-14.txt',
      [
        '[Officium]',
        'S. Example Martyris',
        '',
        '[Rank]',
        'S. Example Martyris;;Duplex;;6;;',
        '',
        '[Rule]',
        'No secunda Vespera'
      ].join('\n')
    );

    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium('04-14=04-14=S. Example Martyris=6=\n')
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-04-14');

    expect(summary.version.handle).toBe('Rubrics 1960 - 1960');
    expect(summary.temporal.dayName).toBe('Pasc2-0');
    expect(summary.overlay).toBeUndefined();
    expect(summary.warnings).toContainEqual({
      code: 'concurrence-rule-veto',
      message:
        'Concurrence winner was chosen by explicit Vespers rule flags before rank comparison.',
      severity: 'info',
      context: {
        reason: 'today-declines-second-vespers',
        today: 'Sancti/04-14',
        tomorrow: 'Tempora/Pasc2-1'
      }
    });
    expect(summary.candidates).toHaveLength(2);
    expect(summary.celebration.feastRef.path).toBe('Sancti/04-14');
    expect(summary.celebrationRules.matins.lessonCount).toBe(9);
    expect(summary.celebrationRules.hasSecondVespers).toBe(false);
    expect(summary.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Pasc2-0']);
    expect(summary.winner.feastRef.path).toBe('Sancti/04-14');
    expect(summary.winner.rank.weight).toBe(1000);
  });

  it('computes concurrence and compline when tomorrow outranks at Vespers', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Tempora/Pent24-2.txt',
      ['[Officium]', 'Feria III', '', '[Rank]', ';;Feria;;1;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Tempora/Pent24-3.txt',
      ['[Officium]', 'Feria IV', '', '[Rank]', ';;Feria;;1;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/11-05.txt',
      ['[Officium]', 'Festum II classis', '', '[Rank]', 'Festum II classis;;Duplex II classis;;5;;'].join(
        '\n'
      )
    );
    corpus.add(
      'horas/Latin/Sancti/11-06.txt',
      ['[Officium]', 'Festum I classis', '', '[Rank]', 'Festum I classis;;Duplex I classis;;6.9;;'].join(
        '\n'
      )
    );

    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium(
          ['11-05=11-05=Festum II classis=5=', '11-06=11-06=Festum I classis=6='].join('\n')
        )
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-11-05');

    expect(summary.concurrence.winner).toBe('tomorrow');
    expect(summary.compline.source.kind).toBe('vespers-winner');
    if (summary.compline.source.kind === 'vespers-winner') {
      expect(summary.compline.source.celebration.feastRef.path).toBe('Sancti/11-06');
    }
  });

  it('recovers today-resolution when a Sancti redirect has no applicable [Rank] section', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add('horas/Latin/Sancti/12-31r.txt', '@Sancti/12-31');
    corpus.add(
      'horas/Latin/Sancti/12-31.txt',
      ['[Officium]', 'S. Silvestri', '', '[Rank]', 'S. Silvestri;;Duplex;;3;;'].join('\n')
    );
    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium('12-31=12-31r=S. Silvestri=3=\n')
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-12-31');

    expect(summary.warnings).toContainEqual({
      code: 'rubric-synth-fallback',
      message:
        'Day summary synthesized fallback temporal data because the resolved Sancti office has no applicable [Rank] section.',
      severity: 'info',
      context: {
        scope: 'day-summary',
        date: '2024-12-31',
        missingPath: 'horas/Latin/Sancti/12-31r.txt',
        cause: 'rankless-office'
      }
    });
  });

  it('propagates today-resolution errors when Sancti [Rank] conditions exist but none match', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Sancti/01-01.txt',
      [
        '[Officium]',
        'Broken rank candidate',
        '',
        '[Rank]',
        '(nisi rubrica 1960)',
        'Broken rank candidate;;Duplex I classis;;5;;'
      ].join('\n')
    );
    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium('01-01=01-01=Broken rank candidate=5=\n')
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    expect(() => engine.resolveDayOfficeSummary('2024-01-01')).toThrow(
      'No matching [Rank] line found in horas/Latin/Sancti/01-01.txt'
    );
  });

  it('lets policyOverride bind a registry version that is not present in VERSION_POLICY', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Tempora/Pasc2-0.txt',
      ['[Officium]', 'Dominica II post Pascha', '', '[Rank]', ';;Semiduplex;;5;;'].join('\n')
    );

    const registry = buildVersionRegistry([
      {
        version: 'Future Breviary - 2099',
        kalendar: '2099',
        transfer: '2099',
        stransfer: '2099'
      }
    ]);
    const kalendarium = buildKalendariumTable([{ name: '2099', entries: parseKalendarium('') }]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Future Breviary - 2099'),
      policyOverride: makeTestPolicy('rubrics-1960', {
        resolveRank(raw, context) {
          const resolved = defaultResolveRank(raw, context);
          return {
            ...resolved,
            weight: resolved.weight + 100
          };
        }
      })
    });

    const summary = engine.resolveDayOfficeSummary('2024-04-14');

    expect(engine.version.handle).toBe('Future Breviary - 2099');
    expect(summary.version.handle).toBe('Future Breviary - 2099');
    expect(summary.celebration.rank.weight).toBe(105);
    expect(summary.winner.rank.weight).toBe(105);
  });

  it('applies overlay substitution with resolved replacement rank and emits replacement warning', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Tempora/Pasc2-0.txt',
      ['[Officium]', 'Dominica II post Pascha', '', '[Rank]', ';;Semiduplex;;5;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Tempora/Nat2-0.txt',
      ['[Officium]', 'Dominica post Nativitatem', '', '[Rank]', ';;Feria;;1;;'].join('\n')
    );

    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([{ name: '1960', entries: [] }]);
    const yearKey = computeYearKey(2024);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([
        {
          yearKey: yearKey.letter,
          entries: [
            {
              kind: 'transfer',
              dateKey: '04-14',
              target: 'Tempora/Nat2-0',
              versionFilter: '1960'
            }
          ]
        }
      ]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-04-14');

    expect(summary.overlay?.officeSubstitution?.path).toBe('Tempora/Nat2-0');
    expect(summary.candidates[0]?.feastRef.path).toBe('Tempora/Nat2-0');
    expect(summary.candidates[0]?.rank.weight).toBe(400);
    expect(summary.warnings).toContainEqual({
      code: 'overlay-replaced-base-candidate',
      message: 'Overlay substitution replaced the temporal base candidate.',
      severity: 'info',
      context: {
        original: 'Tempora/Pasc2-0',
        replaced: 'Tempora/Nat2-0',
        kind: 'temporal'
      }
    });
  });

  it('throws UnsupportedPolicyError for non-1960 occurrence resolution paths', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2024);
    corpus.add(
      'horas/Latin/Tempora/Pasc2-0.txt',
      ['[Officium]', 'Dominica II post Pascha', '', '[Rank]', ';;Semiduplex;;5;;'].join('\n')
    );
    const registry = buildVersionRegistry([
      {
        version: 'Divino Afflatu - 1954',
        kalendar: 'DA',
        transfer: 'DA',
        stransfer: 'DA'
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium: buildKalendariumTable([{ name: 'DA', entries: [] }]),
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Divino Afflatu - 1954'),
      policyMap: VERSION_POLICY
    });

    expect(() => engine.resolveDayOfficeSummary('2024-04-14')).toThrow(UnsupportedPolicyError);
    expect(() => engine.resolveDayOfficeSummary('2024-04-14')).toThrow(
      "Policy 'divino-afflatu' does not implement 'applySeasonPreemption'"
    );
  });

  it('keeps non-1960 concurrence hooks as explicit UnsupportedPolicyError stubs', () => {
    const policy = VERSION_POLICY.get(asVersionHandle('Divino Afflatu - 1954'));
    expect(policy).toBeDefined();
    if (!policy) {
      return;
    }

    const sideView = {
      celebration: {
        feastRef: {
          path: 'Sancti/03-19',
          id: 'Sancti/03-19',
          title: 'S. Joseph'
        },
        rank: {
          name: 'I',
          classSymbol: 'I',
          weight: 1000
        },
        source: 'sanctoral'
      },
      celebrationRules: {
        matins: {
          lessonCount: 9,
          nocturns: 3,
          rubricGate: 'always'
        },
        hasFirstVespers: true,
        hasSecondVespers: true,
        lessonSources: [],
        lessonSetAlternates: [],
        festumDomini: false,
        conclusionMode: 'separate',
        antiphonScheme: 'default',
        omitCommemoration: false,
        noSuffragium: false,
        quorumFestum: false,
        commemoratio3: false,
        unaAntiphona: false,
        unmapped: [],
        hourScopedDirectives: []
      },
      vespersClass: 'totum',
      hasVespers: true
    } as const;

    expect(() =>
      policy.resolveConcurrence({
        today: sideView,
        tomorrow: sideView,
        temporal: {
          date: '2024-03-19',
          dayOfWeek: 2,
          weekStem: 'Quad5',
          dayName: 'Quad5-2',
          season: 'lent',
          feastRef: sideView.celebration.feastRef,
          rank: sideView.celebration.rank
        }
      })
    ).toThrow(UnsupportedPolicyError);
    expect(() =>
      policy.complineSource({
        concurrence: {
          winner: 'today',
          source: sideView.celebration,
          commemorations: [],
          reason: 'today-higher-rank',
          warnings: []
        },
        today: {
          date: '2024-03-19',
          temporal: {
            date: '2024-03-19',
            dayOfWeek: 2,
            weekStem: 'Quad5',
            dayName: 'Quad5-2',
            season: 'lent',
            feastRef: sideView.celebration.feastRef,
            rank: sideView.celebration.rank
          },
          celebration: sideView.celebration,
          celebrationRules: sideView.celebrationRules,
          commemorations: [],
          firstVespersClass: 'totum',
          secondVespersClass: 'totum',
          hasFirstVespers: true,
          hasSecondVespers: true
        },
        tomorrow: {
          date: '2024-03-20',
          temporal: {
            date: '2024-03-20',
            dayOfWeek: 3,
            weekStem: 'Quad5',
            dayName: 'Quad5-3',
            season: 'lent',
            feastRef: sideView.celebration.feastRef,
            rank: sideView.celebration.rank
          },
          celebration: sideView.celebration,
          celebrationRules: sideView.celebrationRules,
          commemorations: [],
          firstVespersClass: 'totum',
          secondVespersClass: 'totum',
          hasFirstVespers: true,
          hasSecondVespers: true
        }
      })
    ).toThrow(UnsupportedPolicyError);
  });

  it('surfaces transferredFrom when St Joseph is transferred from an impeded date', () => {
    const corpus = new TestOfficeTextIndex();
    seedTemporalYear(corpus, 2062);
    seedTemporalYear(corpus, 2063);
    corpus.add(
      'horas/Latin/Tempora/Quad6-0.txt',
      ['[Officium]', 'Dominica in Palmis', '', '[Rank]', ';;Semiduplex I classis;;6.9;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/03-19.txt',
      [
        '[Officium]',
        'S. Joseph Sponsi B.M.V.',
        '',
        '[Rank]',
        'S. Joseph Sponsi B.M.V.;;Duplex I classis;;6.9;;',
        '',
        '[Rule]',
        'No secunda Vespera'
      ].join('\n')
    );

    const registry = buildVersionRegistry([
      {
        version: 'Rubrics 1960 - 1960',
        kalendar: '1960',
        transfer: '1960',
        stransfer: '1960'
      }
    ]);
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium('03-19=03-19=S. Joseph Sponsi B.M.V.=6=\n')
      }
    ]);

    const engine = createRubricalEngine({
      corpus,
      kalendarium,
      yearTransfers: buildYearTransferTable([]),
      scriptureTransfers: buildScriptureTransferTable([]),
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    let transferredSummary:
      | ReturnType<typeof engine.resolveDayOfficeSummary>
      | undefined;
    for (let day = 20; day <= 30; day += 1) {
      const summary = engine.resolveDayOfficeSummary(`2062-03-${String(day).padStart(2, '0')}`);
      if (
        summary.celebration.feastRef.path === 'Sancti/03-19' &&
        summary.celebration.transferredFrom === '2062-03-19'
      ) {
        transferredSummary = summary;
        break;
      }
    }
    if (!transferredSummary) {
      for (let day = 1; day <= 30; day += 1) {
        const summary = engine.resolveDayOfficeSummary(`2062-04-${String(day).padStart(2, '0')}`);
        if (
          summary.celebration.feastRef.path === 'Sancti/03-19' &&
          summary.celebration.transferredFrom === '2062-03-19'
        ) {
          transferredSummary = summary;
          break;
        }
      }
    }

    expect(transferredSummary).toBeDefined();
    expect(transferredSummary?.celebration.transferredFrom).toBe('2062-03-19');
  });
});

function seedTemporalYear(corpus: TestOfficeTextIndex, year: number): void {
  const seen = new Set<string>();
  for (
    let current = new Date(Date.UTC(year, 0, 1));
    current.getUTCFullYear() === year;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const isoDate = `${current.getUTCFullYear().toString().padStart(4, '0')}-${(current.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}-${current.getUTCDate().toString().padStart(2, '0')}`;
    const dayName = dayNameForDate(isoDate);
    if (seen.has(dayName)) {
      continue;
    }
    seen.add(dayName);
    corpus.add(
      `horas/Latin/Tempora/${dayName}.txt`,
      ['[Officium]', dayName, '', '[Rank]', ';;Feria;;5;;'].join('\n')
    );
  }
}
