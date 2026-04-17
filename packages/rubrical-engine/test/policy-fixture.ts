import type { Rank } from '@officium-novum/parser';

import {
  buildCelebrationRuleSet,
  defaultResolveRank,
  type Candidate,
  type ConcurrenceResult,
  type DayConcurrencePreview,
  type PolicyName,
  type PrecedenceFate,
  type RubricalPolicy,
  type TemporalContext,
  type VespersSideView
} from '../src/index.js';

export function makeTestPolicy(
  name: PolicyName,
  options: {
    readonly resolveRank?: RubricalPolicy['resolveRank'];
    readonly defaultFate?: PrecedenceFate;
  } = {}
): RubricalPolicy {
  const resolveRank = options.resolveRank ?? ((raw: Rank) => defaultResolveRank(raw));
  const defaultFate = options.defaultFate ?? 'commemorate';

  return {
    name,
    resolveRank,
    precedenceRow(classSymbol: string) {
      return {
        classSymbol,
        weight: 0,
        citation: 'test fixture',
        decide() {
          return defaultFate;
        }
      };
    },
    applySeasonPreemption(candidates: readonly Candidate[], _temporal: TemporalContext) {
      return {
        kept: [...candidates],
        suppressed: []
      };
    },
    compareCandidates(a: Candidate, b: Candidate): number {
      if (a.rank.weight !== b.rank.weight) {
        return b.rank.weight - a.rank.weight;
      }
      const left = a.source === 'temporal' ? 0 : 1;
      const right = b.source === 'temporal' ? 0 : 1;
      if (left !== right) {
        return left - right;
      }
      return a.feastRef.path.localeCompare(b.feastRef.path);
    },
    isPrivilegedFeria() {
      return false;
    },
    buildCelebrationRuleSet(feastFile, commemorations, context) {
      return buildCelebrationRuleSet(feastFile, commemorations, context);
    },
    transferTarget(_candidate, _fromDate, _until) {
      return null;
    },
    resolveConcurrence(params: {
      readonly today: VespersSideView;
      readonly tomorrow: VespersSideView;
      readonly temporal: TemporalContext;
    }): ConcurrenceResult {
      void params.temporal;
      const compare = defaultCompare(params.today.celebration, params.tomorrow.celebration);
      if (compare < 0) {
        return {
          winner: 'today',
          source: params.today.celebration,
          commemorations: [
            {
              feastRef: params.tomorrow.celebration.feastRef,
              rank: params.tomorrow.celebration.rank,
              reason: 'concurrence',
              hours: ['vespers']
            }
          ],
          reason: 'today-higher-rank',
          warnings: []
        };
      }

      if (compare > 0) {
        return {
          winner: 'tomorrow',
          source: params.tomorrow.celebration,
          commemorations: [
            {
              feastRef: params.today.celebration.feastRef,
              rank: params.today.celebration.rank,
              reason: 'concurrence',
              hours: ['vespers']
            }
          ],
          reason: 'tomorrow-higher-rank',
          warnings: []
        };
      }

      return {
        winner: 'today',
        source: params.today.celebration,
        commemorations: [
          {
            feastRef: params.tomorrow.celebration.feastRef,
            rank: params.tomorrow.celebration.rank,
            reason: 'concurrence',
            hours: ['vespers']
          }
        ],
        reason: 'equal-rank-praestantior',
        warnings: []
      };
    },
    complineSource(params: {
      readonly concurrence: ConcurrenceResult;
      readonly today: DayConcurrencePreview;
      readonly tomorrow: DayConcurrencePreview;
    }) {
      if (params.today.temporal.dayName.startsWith('Quad6-')) {
        return {
          kind: 'triduum-special',
          dayName: params.today.temporal.dayName
        } as const;
      }

      void params.tomorrow;
      return {
        kind: 'vespers-winner',
        celebration: params.concurrence.source
      } as const;
    },
    selectPsalmody() {
      return [];
    },
    hourDirectives() {
      return new Set();
    },
    resolveMatinsShape() {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      } as const;
    },
    resolveTeDeum() {
      return 'say';
    },
    defaultScriptureCourse() {
      return 'post-pentecost';
    },
    octavesEnabled() {
      return null;
    }
  };

  function defaultCompare(left: Candidate, right: Candidate): number {
    if (left.rank.weight !== right.rank.weight) {
      return right.rank.weight - left.rank.weight;
    }
    const leftSource = left.source === 'temporal' ? 0 : 1;
    const rightSource = right.source === 'temporal' ? 0 : 1;
    if (leftSource !== rightSource) {
      return leftSource - rightSource;
    }
    return left.feastRef.path.localeCompare(right.feastRef.path);
  }
}
