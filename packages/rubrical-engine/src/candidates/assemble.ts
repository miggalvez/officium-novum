import type {
  Candidate,
  FeastReference,
  ResolvedRank,
  SanctoralCandidate,
  TemporalContext
} from '../types/model.js';
import type { DirectoriumOverlay, RubricalWarning } from '../types/directorium.js';
import { annotateCandidate } from './metadata.js';

const TEMPORA_PATH_PREFIX = /^Tempora(?:M|Cist|OP)?\//u;
const SANCTORAL_DATE_KEY = /^\d{2}-\d{2}/u;

export interface AssembleOptions {
  readonly overlay?: DirectoriumOverlay;
  readonly transferredIn?: readonly Candidate[];
  readonly detectVigil?: (candidate: Candidate) => FeastReference | null;
  readonly resolveOverlayCandidate?: (
    path: string,
    source: 'temporal' | 'sanctoral'
  ) => { readonly feastRef: FeastReference; readonly rank: ResolvedRank };
  /** @deprecated Prefer resolveOverlayCandidate so rank can be resolved too. */
  readonly resolveFeastReference?: (path: string) => FeastReference;
}

export interface AssembleResult {
  readonly candidates: readonly Candidate[];
  readonly warnings: readonly RubricalWarning[];
}

export function assembleCandidates(
  temporal: TemporalContext,
  sanctoral: readonly SanctoralCandidate[],
  options: AssembleOptions = {}
): AssembleResult {
  const warnings: RubricalWarning[] = [];
  const candidates: Candidate[] = [
    {
      feastRef: temporal.feastRef,
      rank: temporal.rank,
      source: 'temporal'
    },
    ...sanctoral.map<Candidate>((candidate) => ({
      feastRef: candidate.feastRef,
      rank: candidate.rank,
      source: 'sanctoral',
      ...(candidate.kind ? { kind: candidate.kind } : {}),
      ...(candidate.octaveDay ? { octaveDay: candidate.octaveDay } : {})
    })),
    ...normalizeTransferredIn(options.transferredIn)
  ];

  const substitution = options.overlay?.officeSubstitution;
  if (!substitution) {
    return {
      candidates: tagVigils(candidates, options.detectVigil),
      warnings
    };
  }

  const replacementFeastRef = resolveOverlayFeastReference(
    substitution,
    options.resolveFeastReference,
    warnings
  );

  if (TEMPORA_PATH_PREFIX.test(replacementFeastRef.path)) {
    const original = candidates[0];
    if (original) {
      const resolved = resolveOverlayCandidate(
        replacementFeastRef,
        'temporal',
        original.rank,
        options,
        warnings
      );
      candidates[0] = annotateCandidate({
        feastRef: resolved.feastRef,
        rank: resolved.rank,
        source: 'temporal'
      });
      warnings.push(
        replacedCandidateWarning(
          original.feastRef.path,
          resolved.feastRef.path,
          'temporal'
        )
      );
    }
    return {
      candidates: tagVigils(candidates, options.detectVigil),
      warnings
    };
  }

  const substitutionDateKey = extractSanctoralDateKey(replacementFeastRef.path);
  if (substitutionDateKey) {
    const sanctoralIndex = sanctoral.findIndex(
      (candidate) => candidate.dateKey === substitutionDateKey
    );

    if (sanctoralIndex >= 0) {
      const candidateIndex = sanctoralIndex + 1;
      const original = candidates[candidateIndex];
      if (original) {
        const resolved = resolveOverlayCandidate(
          replacementFeastRef,
          'sanctoral',
          original.rank,
          options,
          warnings
        );
        candidates[candidateIndex] = annotateCandidate({
          feastRef: resolved.feastRef,
          rank: resolved.rank,
          source: 'sanctoral'
        });
        warnings.push(
          replacedCandidateWarning(
            original.feastRef.path,
            resolved.feastRef.path,
            'sanctoral'
          )
        );
      }

      return {
        candidates: tagVigils(candidates, options.detectVigil),
        warnings
      };
    }
  }

  const resolved = resolveOverlayCandidate(
    replacementFeastRef,
    'sanctoral',
    temporal.rank,
    options,
    warnings
  );
  candidates.push(annotateCandidate({
    feastRef: resolved.feastRef,
    rank: resolved.rank,
    source: 'sanctoral'
  }));

  return {
    candidates: tagVigils(candidates, options.detectVigil),
    warnings
  };
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

function resolveOverlayFeastReference(
  reference: FeastReference,
  resolveFeastReference: AssembleOptions['resolveFeastReference'],
  warnings: RubricalWarning[]
): FeastReference {
  if (!resolveFeastReference) {
    return reference;
  }

  try {
    return resolveFeastReference(reference.path);
  } catch (error) {
    warnings.push({
      code: 'overlay-resolve-feast-reference-failed',
      message: `Failed to resolve overlay feast reference '${reference.path}'.`,
      severity: 'warn',
      context: {
        path: reference.path,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return reference;
  }
}

function resolveOverlayCandidate(
  reference: FeastReference,
  source: 'temporal' | 'sanctoral',
  fallbackRank: ResolvedRank,
  options: AssembleOptions,
  warnings: RubricalWarning[]
): { readonly feastRef: FeastReference; readonly rank: ResolvedRank } {
  if (options.resolveOverlayCandidate) {
    try {
      return options.resolveOverlayCandidate(reference.path, source);
    } catch (error) {
      warnings.push({
        code: 'overlay-resolve-candidate-failed',
        message: `Failed to resolve overlay candidate '${reference.path}'.`,
        severity: 'error',
        context: {
          path: reference.path,
          source,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      return {
        feastRef: reference,
        rank: fallbackRank
      };
    }
  }

  return {
    feastRef: reference,
    rank: fallbackRank
  };
}

function extractSanctoralDateKey(path: string): string | undefined {
  const [, fileRef] = path.split('/', 2);
  if (!fileRef) {
    return undefined;
  }
  const match = SANCTORAL_DATE_KEY.exec(fileRef);
  return match?.[0];
}

function replacedCandidateWarning(
  originalPath: string,
  replacementPath: string,
  kind: 'temporal' | 'sanctoral'
): RubricalWarning {
  return {
    code: 'overlay-replaced-base-candidate',
    message: `Overlay substitution replaced the ${kind} base candidate.`,
    severity: 'info',
    context: {
      original: originalPath,
      replaced: replacementPath,
      kind
    }
  };
}

function normalizeTransferredIn(candidates: readonly Candidate[] | undefined): readonly Candidate[] {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  return candidates.map((candidate) => ({
    feastRef: candidate.feastRef,
    rank: candidate.rank,
    source: 'transferred-in',
    ...(candidate.kind ? { kind: candidate.kind } : {}),
    ...(candidate.octaveDay ? { octaveDay: candidate.octaveDay } : {}),
    ...(candidate.transferredFrom ? { transferredFrom: candidate.transferredFrom } : {}),
    ...(candidate.vigilOf ? { vigilOf: candidate.vigilOf } : {})
  }));
}

function tagVigils(
  candidates: readonly Candidate[],
  detectVigil: AssembleOptions['detectVigil']
): readonly Candidate[] {
  if (!detectVigil) {
    return candidates.map((candidate) => annotateCandidate(candidate));
  }

  return candidates.map((candidate) => {
    const vigilOf = detectVigil(candidate);
    if (!vigilOf) {
      return annotateCandidate(candidate);
    }
    return annotateCandidate({
      ...candidate,
      vigilOf
    });
  });
}
