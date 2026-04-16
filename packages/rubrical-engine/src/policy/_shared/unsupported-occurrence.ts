import { defaultResolveRank } from '../../sanctoral/rank-normalizer.js';
import {
  UnsupportedPolicyError,
  type PolicyName,
  type RubricalPolicy
} from '../../types/policy.js';

export function createUnsupportedOccurrencePolicy(
  name: Exclude<PolicyName, 'rubrics-1960'>
): RubricalPolicy {
  return {
    name,
    resolveRank: defaultResolveRank,
    precedenceRow() {
      throw unsupported(name, 'precedenceRow');
    },
    applySeasonPreemption() {
      throw unsupported(name, 'applySeasonPreemption');
    },
    compareCandidates() {
      throw unsupported(name, 'compareCandidates');
    },
    isPrivilegedFeria() {
      throw unsupported(name, 'isPrivilegedFeria');
    },
    buildCelebrationRuleSet() {
      throw unsupported(name, 'buildCelebrationRuleSet');
    },
    octavesEnabled() {
      throw unsupported(name, 'octavesEnabled');
    }
  };
}

function unsupported(policyName: PolicyName, feature: string): UnsupportedPolicyError {
  return new UnsupportedPolicyError(policyName, feature);
}
