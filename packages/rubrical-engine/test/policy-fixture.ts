import type { Rank } from '@officium-nova/parser';

import {
  buildCelebrationRuleSet,
  defaultResolveRank,
  type Candidate,
  type PolicyName,
  type PrecedenceFate,
  type RubricalPolicy,
  type TemporalContext
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
      if (a.source !== b.source) {
        return a.source === 'temporal' ? -1 : 1;
      }
      return a.feastRef.path.localeCompare(b.feastRef.path);
    },
    isPrivilegedFeria() {
      return false;
    },
    buildCelebrationRuleSet(feastFile, commemorations, context) {
      return buildCelebrationRuleSet(feastFile, commemorations, context);
    },
    octavesEnabled() {
      return null;
    }
  };
}
