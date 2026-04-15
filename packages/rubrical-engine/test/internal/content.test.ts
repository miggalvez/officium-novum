import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  defaultResolveRank,
  type ResolvedVersion,
  type RubricalPolicy
} from '../../src/index.js';
import { canonicalContentDir, resolveOfficeDefinition } from '../../src/internal/content.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('canonicalContentDir', () => {
  it.each([
    ['rubrics-1960', 'Tempora', 'Tempora'],
    ['monastic-divino', 'Tempora', 'TemporaM'],
    ['cistercian-1951', 'Sancti', 'SanctiCist'],
    ['dominican-1962', 'Sancti', 'SanctiOP']
  ] as const)('maps %s %s to %s', (policyName, base, expected) => {
    const version = makeVersion('Test Handle', {
      name: policyName,
      resolveRank: defaultResolveRank
    });

    expect(canonicalContentDir(base, version)).toBe(expected);
  });
});

describe('resolveOfficeDefinition', () => {
  it('prefers a matching conditioned rank over the default rank', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Tempora/Pasc0-1.txt',
      [
        '[Officium]',
        'Feria II infra Octavam Paschae',
        '',
        '[Rank]',
        'Default;;Semiduplex;;4;;',
        '',
        '[Rank] (rubrica 196 aut rubrica 1955)',
        'Modern;;Feria;;1.2;;',
        '',
        '[Rank] (rubrica divino)',
        'Divino;;Duplex;;6;;'
      ].join('\n')
    );

    const definition = resolveOfficeDefinition(
      corpus,
      'Tempora/Pasc0-1',
      {
        date: { year: 2024, month: 4, day: 1 },
        dayOfWeek: 1,
        season: 'eastertide',
        version: makeVersion('Rubrics 1960 - 1960', {
          name: 'rubrics-1960',
          resolveRank: defaultResolveRank
        })
      }
    );

    expect(definition.feastRef.title).toBe('Modern');
    expect(definition.rawRank.classWeight).toBe(1.2);
  });

  it('falls back to the default rank when no conditioned rank matches', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/01-07.txt',
      [
        '[Officium]',
        'Default Office',
        '',
        '[Rank]',
        'Default Office;;Semiduplex;;5.6;;',
        '',
        '[Rank] (rubrica 196 aut rubrica 1955)',
        'Modern Office;;Feria;;1.2;;'
      ].join('\n')
    );

    const definition = resolveOfficeDefinition(
      corpus,
      'Sancti/01-07',
      {
        date: { year: 2024, month: 1, day: 7 },
        dayOfWeek: 0,
        season: 'christmastide',
        version: makeVersion('Tridentine - 1570', {
          name: 'tridentine-1570',
          resolveRank: defaultResolveRank
        })
      }
    );

    expect(definition.feastRef.title).toBe('Default Office');
    expect(definition.rawRank.classWeight).toBe(5.6);
  });
});

function makeVersion(handle: string, policy: RubricalPolicy): ResolvedVersion {
  return {
    handle: asVersionHandle(handle),
    kalendar: 'test',
    transfer: 'test',
    stransfer: 'test',
    policy
  };
}
