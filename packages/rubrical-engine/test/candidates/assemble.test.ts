import { describe, expect, it } from 'vitest';

import { assembleCandidates, pickNaiveWinner } from '../../src/index.js';
import type { TemporalContext } from '../../src/types/model.js';

const TEMPORAL: TemporalContext = {
  date: '2024-04-14',
  dayOfWeek: 0,
  weekStem: 'Pasc1',
  dayName: 'Pasc1-0',
  season: 'eastertide',
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

describe('assembleCandidates / pickNaiveWinner', () => {
  it('keeps prior behavior when no overlay is present', () => {
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
    ] as const;

    const result = assembleCandidates(TEMPORAL, sanctoral);

    expect(result.candidates).toEqual([
      {
        feastRef: TEMPORAL.feastRef,
        rank: TEMPORAL.rank,
        source: 'temporal'
      },
      {
        feastRef: sanctoral[0].feastRef,
        rank: sanctoral[0].rank,
        source: 'sanctoral'
      }
    ]);
    expect(result.warnings).toEqual([]);
    expect(pickNaiveWinner(result.candidates)).toEqual(result.candidates[0]);
  });

  it('replaces the temporal candidate when overlay substitution targets Tempora', () => {
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
    ] as const;

    const result = assembleCandidates(TEMPORAL, sanctoral, {
      overlay: {
        officeSubstitution: {
          path: 'Tempora/Nat2-0',
          id: 'Tempora/Nat2-0',
          title: 'Nat2-0'
        }
      },
      resolveOverlayCandidate: (path) => ({
        feastRef: {
          path,
          id: path,
          title: 'Resolved Tempora Title'
        },
        rank: {
          name: 'Resolved Rank',
          weight: 1,
          classSymbol: 'resolved'
        }
      })
    });

    expect(result.candidates[0]).toEqual({
      feastRef: {
        path: 'Tempora/Nat2-0',
        id: 'Tempora/Nat2-0',
        title: 'Resolved Tempora Title'
      },
      rank: {
        name: 'Resolved Rank',
        weight: 1,
        classSymbol: 'resolved'
      },
      source: 'temporal'
    });
    expect(result.warnings).toContainEqual({
      code: 'overlay-replaced-base-candidate',
      message: 'Overlay substitution replaced the temporal base candidate.',
      severity: 'info',
      context: {
        original: 'Tempora/Pasc1-0',
        replaced: 'Tempora/Nat2-0',
        kind: 'temporal'
      }
    });
  });

  it('replaces the same-date sanctoral candidate when overlay substitution targets Sancti', () => {
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
    ] as const;

    const result = assembleCandidates(TEMPORAL, sanctoral, {
      overlay: {
        officeSubstitution: {
          path: 'Sancti/04-14x',
          id: 'Sancti/04-14x',
          title: '04-14x'
        }
      }
    });

    expect(result.candidates[1]).toEqual({
      feastRef: {
        path: 'Sancti/04-14x',
        id: 'Sancti/04-14x',
        title: '04-14x'
      },
      rank: sanctoral[0].rank,
      source: 'sanctoral'
    });
    expect(result.warnings).toContainEqual({
      code: 'overlay-replaced-base-candidate',
      message: 'Overlay substitution replaced the sanctoral base candidate.',
      severity: 'info',
      context: {
        original: 'Sancti/04-14',
        replaced: 'Sancti/04-14x',
        kind: 'sanctoral'
      }
    });
  });

  it('appends a sanctoral candidate when overlay Sancti substitution has no same-date candidate', () => {
    const result = assembleCandidates(TEMPORAL, [], {
      overlay: {
        officeSubstitution: {
          path: 'Sancti/01-25',
          id: 'Sancti/01-25',
          title: '01-25'
        }
      }
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[1]).toEqual({
      feastRef: {
        path: 'Sancti/01-25',
        id: 'Sancti/01-25',
        title: '01-25'
      },
      rank: TEMPORAL.rank,
      source: 'sanctoral'
    });
    expect(result.warnings).toEqual([]);
  });

  it('records resolver failures as error-severity warnings and falls back to displaced rank', () => {
    const result = assembleCandidates(TEMPORAL, [], {
      overlay: {
        officeSubstitution: {
          path: 'Tempora/Nat2-0',
          id: 'Tempora/Nat2-0',
          title: 'Nat2-0'
        }
      },
      resolveOverlayCandidate: () => {
        throw new Error('resolver exploded');
      }
    });

    expect(result.candidates[0]).toEqual({
      feastRef: {
        path: 'Tempora/Nat2-0',
        id: 'Tempora/Nat2-0',
        title: 'Nat2-0'
      },
      rank: TEMPORAL.rank,
      source: 'temporal'
    });
    expect(result.warnings).toContainEqual({
      code: 'overlay-resolve-candidate-failed',
      message: "Failed to resolve overlay candidate 'Tempora/Nat2-0'.",
      severity: 'error',
      context: {
        path: 'Tempora/Nat2-0',
        source: 'temporal',
        error: 'resolver exploded'
      }
    });
  });

  it('appends transferred-in candidates with transferredFrom metadata', () => {
    const transferredIn = [
      {
        feastRef: {
          path: 'Sancti/03-19',
          id: 'Sancti/03-19',
          title: 'S. Joseph Sponsi B.M.V.'
        },
        rank: {
          name: 'Duplex I classis',
          weight: 1000,
          classSymbol: 'I'
        },
        source: 'transferred-in' as const,
        transferredFrom: '2024-03-19'
      }
    ] as const;

    const result = assembleCandidates(TEMPORAL, [], {
      transferredIn
    });

    expect(result.candidates).toContainEqual({
      feastRef: transferredIn[0].feastRef,
      rank: transferredIn[0].rank,
      source: 'transferred-in',
      transferredFrom: '2024-03-19'
    });
  });

  it('tags vigil candidates when detectVigil returns a feast reference', () => {
    const vigilOf = {
      path: 'Sancti/12-25',
      id: 'Sancti/12-25',
      title: 'In Nativitate Domini'
    };

    const result = assembleCandidates(
      TEMPORAL,
      [
        {
          dateKey: '12-24',
          feastRef: {
            path: 'Sancti/12-24',
            id: 'Sancti/12-24',
            title: 'In Vigilia Nativitatis Domini'
          },
          rank: {
            name: 'Duplex I classis',
            weight: 1000,
            classSymbol: 'I'
          }
        }
      ],
      {
        detectVigil: (candidate) =>
          candidate.feastRef.path === 'Sancti/12-24' ? vigilOf : null
      }
    );

    expect(result.candidates[1]).toEqual({
      feastRef: {
        path: 'Sancti/12-24',
        id: 'Sancti/12-24',
        title: 'In Vigilia Nativitatis Domini'
      },
      rank: {
        name: 'Duplex I classis',
        weight: 1000,
        classSymbol: 'I'
      },
      source: 'sanctoral',
      kind: 'vigil',
      vigilOf
    });
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
