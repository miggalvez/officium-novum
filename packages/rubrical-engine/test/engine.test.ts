import { parseKalendarium } from '@officium-nova/parser';
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
  defaultResolveRank
} from '../src/index.js';
import { TestOfficeTextIndex } from './helpers.js';
import { makeTestPolicy } from './policy-fixture.js';

describe('createRubricalEngine', () => {
  it('resolves a day summary with temporal + sanctoral candidates and an occurrence winner', () => {
    const corpus = new TestOfficeTextIndex();
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
    expect(summary.warnings).toEqual([]);
    expect(summary.candidates).toHaveLength(2);
    expect(summary.celebration.feastRef.path).toBe('Sancti/04-14');
    expect(summary.celebrationRules.matins.lessonCount).toBe(9);
    expect(summary.celebrationRules.hasSecondVespers).toBe(false);
    expect(summary.commemorations.map((entry) => entry.feastRef.path)).toEqual(['Tempora/Pasc2-0']);
    expect(summary.winner.feastRef.path).toBe('Sancti/04-14');
    expect(summary.winner.rank.weight).toBe(1000);
  });

  it('lets policyOverride bind a registry version that is not present in VERSION_POLICY', () => {
    const corpus = new TestOfficeTextIndex();
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
});
