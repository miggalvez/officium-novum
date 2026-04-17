import { parseKalendarium } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import {
  VERSION_POLICY,
  asVersionHandle,
  buildKalendariumTable,
  buildVersionRegistry,
  resolveVersion,
  sanctoralCandidates
} from '../../src/index.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('sanctoralCandidates', () => {
  const registry = buildVersionRegistry([
    {
      version: 'Rubrics 1960 - 1960',
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960',
      base: 'Reduced - 1955'
    },
    {
      version: 'Reduced - 1955',
      kalendar: '1955',
      transfer: '1955',
      stransfer: '1955'
    }
  ]);

  const version = resolveVersion(asVersionHandle('Rubrics 1960 - 1960'), registry, VERSION_POLICY);

  it('walks the kalendarium inheritance chain and expands alternates', () => {
    const kalendarium = buildKalendariumTable([
      { name: '1960', entries: parseKalendarium('') },
      {
        name: '1955',
        entries: parseKalendarium('01-07=01-07r~01-07=S. Example=3=\n')
      }
    ]);

    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/01-07r.txt',
      [
        '[Officium]',
        'Primary Feast',
        '',
        '[Rank]',
        'Primary Feast;;Semiduplex;;4;;',
        '',
        '[Rank] (rubrica 196 aut rubrica 1955)',
        'Primary Feast Modern;;Feria;;1.2;;'
      ].join('\n')
    );
    corpus.add(
      'horas/Latin/Sancti/01-07.txt',
      ['[Officium]', 'Alternate Feast', '', '[Rank]', 'Alternate Feast;;Duplex;;3;;'].join('\n')
    );

    const candidates = sanctoralCandidates('2024-01-07', version, registry, kalendarium, corpus);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.feastRef.path)).toEqual([
      'Sancti/01-07r',
      'Sancti/01-07'
    ]);
    expect(candidates[0]?.rank.weight).toBe(400);
    expect(candidates[0]?.feastRef.title).toBe('Primary Feast Modern');
  });

  it('lets a descendant kalendar suppress an inherited feast', () => {
    const kalendarium = buildKalendariumTable([
      { name: '1960', entries: parseKalendarium('01-07=XXXXX\n') },
      {
        name: '1955',
        entries: parseKalendarium('01-07=01-07r=S. Example=3=\n')
      }
    ]);

    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/01-07r.txt',
      ['[Officium]', 'Suppressed Feast', '', '[Rank]', 'Suppressed Feast;;Duplex;;3;;'].join('\n')
    );

    expect(sanctoralCandidates('2024-01-07', version, registry, kalendarium, corpus)).toEqual([]);
  });

  it('uses the special leap-year sanctoral keying around 24 February', () => {
    const kalendarium = buildKalendariumTable([
      {
        name: '1960',
        entries: parseKalendarium('02-29=02-24=S. Matthiae Apostoli=3=\n')
      }
    ]);

    const corpus = new TestOfficeTextIndex();
    corpus.add(
      'horas/Latin/Sancti/02-24.txt',
      ['[Officium]', 'S. Matthiae Apostoli', '', '[Rank]', 'S. Matthiae Apostoli;;Duplex;;3;;'].join('\n')
    );

    const candidates = sanctoralCandidates('2024-02-24', version, registry, kalendarium, corpus);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.feastRef.path).toBe('Sancti/02-24');
  });
});
