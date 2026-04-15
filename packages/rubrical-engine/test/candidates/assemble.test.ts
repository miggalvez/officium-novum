import { describe, expect, it } from 'vitest';

import { assembleCandidates, pickNaiveWinner } from '../../src/index.js';

describe('assembleCandidates / pickNaiveWinner', () => {
  it('merges temporal and sanctoral candidates and picks the highest raw rank', () => {
    const temporal = {
      date: '2024-04-14',
      dayOfWeek: 0,
      weekStem: 'Pasc1',
      dayName: 'Pasc1-0',
      season: 'eastertide' as const,
      feastRef: {
        path: 'Tempora/Pasc1-0',
        id: 'Tempora/Pasc1-0',
        title: 'Dominica II post Pascha'
      },
      rank: {
        name: 'Semiduplex',
        weight: 5,
        classSymbol: 'semiduplex'
      }
    };
    const sanctoral = [
      {
        dateKey: '04-14',
        feastRef: {
          path: 'Sancti/04-14',
          id: 'Sancti/04-14',
          title: 'S. Example'
        },
        rank: {
          name: 'Simplex',
          weight: 2,
          classSymbol: 'simplex'
        }
      }
    ];

    const candidates = assembleCandidates(temporal, sanctoral);

    expect(candidates).toEqual([
      {
        feastRef: temporal.feastRef,
        rank: temporal.rank,
        source: 'temporal'
      },
      {
        feastRef: sanctoral[0]!.feastRef,
        rank: sanctoral[0]!.rank,
        source: 'sanctoral'
      }
    ]);
    expect(pickNaiveWinner(candidates)).toEqual(candidates[0]);
  });

  it('breaks equal-rank ties in favor of the temporal candidate', () => {
    const candidates = [
      {
        feastRef: {
          path: 'Tempora/Pent01-0',
          id: 'Tempora/Pent01-0',
          title: 'Dominica infra Octavam Pentecostes'
        },
        rank: {
          name: 'Duplex',
          weight: 6,
          classSymbol: 'duplex'
        },
        source: 'temporal' as const
      },
      {
        feastRef: {
          path: 'Sancti/06-01',
          id: 'Sancti/06-01',
          title: 'S. Example'
        },
        rank: {
          name: 'Duplex',
          weight: 6,
          classSymbol: 'duplex'
        },
        source: 'sanctoral' as const
      }
    ];

    expect(pickNaiveWinner(candidates)).toBe(candidates[0]);
  });
});
