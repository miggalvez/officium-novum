import { parseKalendarium } from '@officium-nova/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildVersionRegistry,
  createRubricalEngine,
  defaultResolveRank
} from '../src/index.js';
import { TestOfficeTextIndex } from './helpers.js';

describe('createRubricalEngine', () => {
  it('resolves a day summary with temporal + sanctoral candidates and a naive winner', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Tempora/Pasc2-0.txt',
      ['[Officium]', 'Dominica II post Pascha', '', '[Rank]', ';;Semiduplex;;5;;'].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/04-14.txt',
      ['[Officium]', 'S. Example Martyris', '', '[Rank]', 'S. Example Martyris;;Duplex;;6;;'].join('\n')
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
      versionRegistry: registry,
      version: asVersionHandle('Rubrics 1960 - 1960'),
      policyMap: VERSION_POLICY
    });

    const summary = engine.resolveDayOfficeSummary('2024-04-14');

    expect(summary.version.handle).toBe('Rubrics 1960 - 1960');
    expect(summary.temporal.dayName).toBe('Pasc2-0');
    expect(summary.candidates).toHaveLength(2);
    expect(summary.winner.feastRef.path).toBe('Sancti/04-14');
    expect(summary.winner.rank.weight).toBe(6);
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
      versionRegistry: registry,
      version: asVersionHandle('Future Breviary - 2099'),
      policyOverride: {
        name: 'rubrics-1960',
        resolveRank(raw, context) {
          const resolved = defaultResolveRank(raw, context);
          return {
            ...resolved,
            weight: resolved.weight + 100
          };
        }
      }
    });

    const summary = engine.resolveDayOfficeSummary('2024-04-14');

    expect(engine.version.handle).toBe('Future Breviary - 2099');
    expect(summary.version.handle).toBe('Future Breviary - 2099');
    expect(summary.winner.rank.weight).toBe(105);
  });
});
