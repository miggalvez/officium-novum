import type {
  Candidate,
  SanctoralCandidate,
  TemporalContext
} from '../types/model.js';

export function assembleCandidates(
  temporal: TemporalContext,
  sanctoral: readonly SanctoralCandidate[]
): readonly Candidate[] {
  return [
    {
      feastRef: temporal.feastRef,
      rank: temporal.rank,
      source: 'temporal'
    },
    ...sanctoral.map<Candidate>((candidate) => ({
      feastRef: candidate.feastRef,
      rank: candidate.rank,
      source: 'sanctoral'
    }))
  ];
}

export function pickNaiveWinner(candidates: readonly Candidate[]): Candidate {
  const winner = candidates[0];
  if (!winner) {
    throw new Error('Cannot select a winner from an empty candidate list.');
  }

  let best = winner;
  for (const candidate of candidates.slice(1)) {
    if (candidate.rank.weight > best.rank.weight) {
      best = candidate;
    }
  }

  return best;
}
