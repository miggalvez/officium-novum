import type {
  Candidate,
  FeastReference,
  SanctoralCandidate
} from '../types/model.js';

const OCTAVE_ORDINALS: ReadonlyArray<readonly [RegExp, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8]> = [
  [/\bin\s+octava\b/iu, 8],
  [/\boctavae?\b/iu, 8],
  [/\bprima\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 1],
  [/\bsecunda\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 2],
  [/\btert(?:ia|io)\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 3],
  [/\bquarta\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 4],
  [/\bquinta\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 5],
  [/\bsexta\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 6],
  [/\bseptima\s+die\s+infra\s+(?:octavam|8vam)\b/iu, 7]
];

export function annotateSanctoralCandidate(candidate: SanctoralCandidate): SanctoralCandidate {
  return {
    ...candidate,
    ...inferCandidateMetadata(candidate.feastRef)
  };
}

export function annotateCandidate(candidate: Candidate): Candidate {
  return {
    ...candidate,
    ...inferCandidateMetadata(candidate.feastRef),
    ...(candidate.vigilOf ? { kind: 'vigil' as const } : {})
  };
}

export function inferCandidateMetadata(
  feastRef: FeastReference
): Pick<Candidate, 'kind' | 'octaveDay'> {
  if (/\bvigilia\b/iu.test(feastRef.title)) {
    return { kind: 'vigil' };
  }

  if (/\b(?:infra\s+(?:octavam|8vam)|octavae?)\b/iu.test(feastRef.title)) {
    return {
      kind: 'octave',
      ...inferOctaveDay(feastRef.title)
    };
  }

  return {};
}

function inferOctaveDay(title: string): Pick<Candidate, 'octaveDay'> {
  for (const [pattern, octaveDay] of OCTAVE_ORDINALS) {
    if (pattern.test(title)) {
      return { octaveDay };
    }
  }

  return {};
}
