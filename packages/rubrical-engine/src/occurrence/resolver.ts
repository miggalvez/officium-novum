import type { RubricalWarning } from '../types/directorium.js';
import type {
  Candidate,
  TemporalContext
} from '../types/model.js';
import type {
  Celebration,
  Commemoration,
  CommemorationReason
} from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';

export interface TransferFlag {
  readonly candidate: Candidate;
  readonly reason: 'impeded-by-higher-rank';
}

export interface OccurrenceResult {
  readonly celebration: Celebration;
  readonly commemorations: readonly Commemoration[];
  readonly omitted: readonly Candidate[];
  readonly transferQueue: readonly TransferFlag[];
  readonly warnings: readonly RubricalWarning[];
}

const DEFAULT_COMMEMORATION_HOURS = ['lauds', 'vespers'] as const;

export function resolveOccurrence(
  candidates: readonly Candidate[],
  temporal: TemporalContext,
  policy: RubricalPolicy
): OccurrenceResult {
  if (candidates.length === 0) {
    throw new Error('Cannot resolve occurrence from an empty candidate list.');
  }

  const preemption = policy.applySeasonPreemption(candidates, temporal);
  const omitted: Candidate[] = preemption.suppressed.map((entry) => entry.candidate);
  const warnings: RubricalWarning[] = preemption.suppressed.map((entry) => ({
    code: 'occurrence-season-preemption',
    message: 'Seasonal pre-emption suppressed a candidate before occurrence sorting.',
    severity: 'info',
    context: {
      candidate: entry.candidate.feastRef.path,
      reason: entry.reason
    }
  }));

  const ordered = stableSortByPolicy(preemption.kept, policy);
  const winner = ordered[0];
  if (!winner) {
    throw new Error('Occurrence resolution produced no remaining candidates.');
  }

  const celebration: Celebration = {
    feastRef: winner.feastRef,
    rank: winner.rank,
    source: winner.source === 'temporal' ? 'temporal' : 'sanctoral',
    ...(winner.kind ? { kind: winner.kind } : {}),
    ...(winner.octaveDay ? { octaveDay: winner.octaveDay } : {}),
    ...(winner.vigilOf ? { vigil: winner.vigilOf } : {}),
    ...(winner.transferredFrom ? { transferredFrom: winner.transferredFrom } : {})
  };

  const commemorations: Commemoration[] = [];
  const transferQueue: TransferFlag[] = [];

  for (const loser of ordered.slice(1)) {
    const row = policy.precedenceRow(loser.rank.classSymbol);
    const fate = row.decide({
      candidate: loser,
      winner,
      temporal,
      allCandidates: ordered
    });

    if (fate === 'commemorate') {
      // TODO(phase-2g, design §15.1): rule-based commemoration suppression is deferred.
      commemorations.push({
        feastRef: loser.feastRef,
        rank: loser.rank,
        reason: commemorationReason(loser, temporal, policy),
        hours: DEFAULT_COMMEMORATION_HOURS,
        ...(loser.kind ? { kind: loser.kind } : {}),
        ...(loser.octaveDay ? { octaveDay: loser.octaveDay } : {})
      });
      continue;
    }

    if (fate === 'transfer') {
      transferQueue.push({
        candidate: loser,
        reason: 'impeded-by-higher-rank'
      });
      warnings.push({
        code: 'occurrence-transfer-deferred',
        message: 'Transfer target computation is deferred to Phase 2e.',
        severity: 'info',
        context: {
          candidate: loser.feastRef.path,
          reason: 'impeded-by-higher-rank'
        }
      });
      continue;
    }

    omitted.push(loser);
    warnings.push({
      code: 'occurrence-omitted',
      message: 'Candidate omitted by precedence table fate.',
      severity: 'info',
      context: {
        candidate: loser.feastRef.path
      }
    });
  }

  return {
    celebration,
    commemorations,
    omitted,
    transferQueue,
    warnings
  };
}

function stableSortByPolicy(
  candidates: readonly Candidate[],
  policy: RubricalPolicy
): readonly Candidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const rankOrder = policy.compareCandidates(left.candidate, right.candidate);
      if (rankOrder !== 0) {
        return rankOrder;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.candidate);
}

function commemorationReason(
  loser: Candidate,
  temporal: TemporalContext,
  policy: RubricalPolicy
): CommemorationReason {
  if (loser.source !== 'temporal') {
    if (loser.kind === 'octave') {
      return 'octave-continuing';
    }
    return 'occurrence-impeded';
  }

  if (temporal.dayOfWeek === 0) {
    return 'sunday';
  }

  if (policy.isPrivilegedFeria(temporal)) {
    return 'privileged-feria';
  }

  return 'occurrence-impeded';
}
