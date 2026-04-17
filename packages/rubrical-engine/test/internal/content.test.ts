import { describe, expect, it } from 'vitest';

import {
  asVersionHandle,
  type ResolvedVersion,
  type RubricalPolicy
} from '../../src/index.js';
import {
  canonicalContentDir,
  resolveOfficeDefinition,
  resolveOfficeFile
} from '../../src/internal/content.js';
import { makeTestPolicy } from '../policy-fixture.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('canonicalContentDir', () => {
  it.each([
    ['rubrics-1960', 'Tempora', 'Tempora'],
    ['monastic-divino', 'Tempora', 'TemporaM'],
    ['cistercian-1951', 'Sancti', 'SanctiCist'],
    ['dominican-1962', 'Sancti', 'SanctiOP']
  ] as const)('maps %s %s to %s', (policyName, base, expected) => {
    const version = makeVersion('Test Handle', makeTestPolicy(policyName));

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
        version: makeVersion('Rubrics 1960 - 1960', makeTestPolicy('rubrics-1960'))
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
        version: makeVersion('Tridentine - 1570', makeTestPolicy('tridentine-1570'))
      }
    );

    expect(definition.feastRef.title).toBe('Default Office');
    expect(definition.rawRank.classWeight).toBe(5.6);
  });
});

describe('resolveOfficeFile', () => {
  it('merges preamble alias content with local section overrides', () => {
    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Tempora/Pent01-0.txt',
      [
        '[Officium]',
        'Dominica I post Pentecosten',
        '',
        '[Rank]',
        ';;Semiduplex;;4',
        '',
        '[Rule]',
        'No Commemoration'
      ].join('\n')
    );
    corpus.add(
      'horas/Latin/Tempora/Pent01-0r.txt',
      [
        '@Tempora/Pent01-0',
        '',
        '[Officium]',
        'Dominica Sanctissimae Trinitatis',
        '',
        '[Rank]',
        ';;Duplex I classis;;7'
      ].join('\n')
    );

    const file = resolveOfficeFile(corpus, 'Tempora/Pent01-0r');

    expect(file.path).toBe('horas/Latin/Tempora/Pent01-0r.txt');
    expect(file.sections.find((section) => section.header === 'Officium')?.content[0]).toMatchObject({
      type: 'text',
      value: 'Dominica Sanctissimae Trinitatis'
    });
    expect(file.sections.find((section) => section.header === 'Rule')?.rules?.[0]).toMatchObject({
      kind: 'action',
      keyword: 'No',
      args: ['Commemoration']
    });
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
