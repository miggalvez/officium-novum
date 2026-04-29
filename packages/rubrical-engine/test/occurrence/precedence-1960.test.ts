import { describe, expect, it } from 'vitest';

import {
  CLASS_SYMBOLS_1960,
  PRECEDENCE_1960,
  type Candidate,
  type ClassSymbol1960,
  type TemporalContext
} from '../../src/index.js';

const EXPECTED_FATE: Readonly<Record<ClassSymbol1960, 'commemorate' | 'omit' | 'transfer'>> = {
  'I-privilegiata-triduum': 'omit',
  'I-privilegiata-sundays': 'commemorate',
  'I-privilegiata-ash-wednesday': 'commemorate',
  'I-privilegiata-holy-week-feria': 'commemorate',
  'I-privilegiata-christmas-vigil': 'commemorate',
  'II-ember-day': 'commemorate',
  I: 'transfer',
  II: 'commemorate',
  III: 'commemorate',
  'IV-lenten-feria': 'commemorate',
  IV: 'commemorate',
  'commemoration-only': 'commemorate'
};

describe('PRECEDENCE_1960', () => {
  it('covers every declared class symbol exactly once', () => {
    const seen = new Set(PRECEDENCE_1960.map((entry) => entry.classSymbol));
    expect(seen.size).toBe(CLASS_SYMBOLS_1960.length);
    expect([...seen].sort()).toEqual([...CLASS_SYMBOLS_1960].sort());
  });

  it('has specific RI/Tabella citations on every row', () => {
    for (const row of PRECEDENCE_1960) {
      expect(row.citation.length).toBeGreaterThan(20);
      expect(row.citation).toMatch(/Rubricarum Instructum|Tabella Dierum Liturgicorum/u);
    }
  });

  it('produces expected fates across winner/loser combinations', () => {
    const temporal = temporalContext();
    const winnerClasses: readonly ClassSymbol1960[] = [
      'I-privilegiata-triduum',
      'I-privilegiata-sundays',
      'I',
      'II',
      'III',
      'IV'
    ];

    for (const row of PRECEDENCE_1960) {
      for (const winnerClass of winnerClasses) {
        const loser = candidate(`Sancti/loser/${row.classSymbol}`, row.classSymbol, 'sanctoral');
        const winner = candidate(`Tempora/winner/${winnerClass}`, winnerClass, 'temporal');
        const fate = row.decide({
          candidate: loser,
          winner,
          temporal,
          allCandidates: [winner, loser]
        });

        // RI §§91-99 and Tabella Dierum Liturgicorum: fate of the impeded class is table-driven.
        expect(fate).toBe(EXPECTED_FATE[row.classSymbol as ClassSymbol1960]);
      }
    }
  });

  it('keeps second-class ember ferias below the generic second-class bucket', () => {
    const ember = PRECEDENCE_1960.find((entry) => entry.classSymbol === 'II-ember-day');
    const secondClass = PRECEDENCE_1960.find((entry) => entry.classSymbol === 'II');

    expect(ember?.weight).toBeLessThan(secondClass?.weight ?? 0);
  });
});

function temporalContext(): TemporalContext {
  return {
    date: '2024-03-24',
    dayOfWeek: 0,
    weekStem: 'Quad6',
    dayName: 'Quad6-0',
    season: 'passiontide',
    feastRef: {
      path: 'Tempora/Quad6-0',
      id: 'Tempora/Quad6-0',
      title: 'Dominica in Palmis'
    },
    rank: {
      name: 'I-privilegiata-sundays',
      classSymbol: 'I-privilegiata-sundays',
      weight: 1250
    }
  };
}

function candidate(path: string, classSymbol: ClassSymbol1960, source: Candidate['source']): Candidate {
  const row = PRECEDENCE_1960.find((entry) => entry.classSymbol === classSymbol);
  if (!row) {
    throw new Error(`Unknown class symbol in test: ${classSymbol}`);
  }

  return {
    feastRef: {
      path,
      id: path,
      title: path
    },
    rank: {
      name: classSymbol,
      classSymbol,
      weight: row.weight
    },
    source
  };
}
