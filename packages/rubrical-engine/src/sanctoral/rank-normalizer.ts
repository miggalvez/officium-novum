import type { Rank } from '@officium-nova/parser';

import type { ResolvedRank } from '../types/model.js';
import type { RankContext, RubricalPolicy } from '../types/policy.js';

export function normalizeRank(
  raw: Rank,
  policy: RubricalPolicy,
  context: RankContext
): ResolvedRank {
  return policy.resolveRank(raw, context);
}

export function defaultResolveRank(raw: Rank): ResolvedRank {
  const name = raw.name.trim() || raw.derivation?.trim() || 'Unclassified';
  const classSymbol = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'rank';

  return {
    name,
    weight: raw.classWeight,
    classSymbol
  };
}
