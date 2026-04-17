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
    transferTarget() {
      throw unsupported(name, 'transferTarget');
    },
    resolveConcurrence() {
      throw unsupported(name, 'resolveConcurrence');
    },
    complineSource() {
      throw unsupported(name, 'complineSource');
    },
    selectPsalmody() {
      throw unsupported(name, 'selectPsalmody');
    },
    hourDirectives() {
      throw unsupported(name, 'hourDirectives');
    },
    limitCommemorations() {
      throw unsupported(name, 'limitCommemorations');
    },
    resolveMatinsShape() {
      throw unsupported(name, 'resolveMatinsShape');
    },
    resolveTeDeum() {
      throw unsupported(name, 'resolveTeDeum');
    },
    defaultScriptureCourse() {
      throw unsupported(name, 'defaultScriptureCourse');
    },
    octavesEnabled() {
      throw unsupported(name, 'octavesEnabled');
    }
  };
}

function unsupported(policyName: PolicyName, feature: string): UnsupportedPolicyError {
  return new UnsupportedPolicyError(policyName, feature);
}
