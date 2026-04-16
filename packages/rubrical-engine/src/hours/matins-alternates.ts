import { conditionMatches } from '../internal/conditions.js';
import { normalizeDateInput } from '../internal/date.js';
import type { ResolvedVersion } from '../types/version.js';
import type { AlternateLocation, LessonSetAlternate } from '../types/rule-set.js';
import type { TemporalContext } from '../types/model.js';

export interface SelectLessonAlternateInput {
  readonly nocturn: 1 | 2 | 3;
  readonly alternates: readonly LessonSetAlternate[];
  readonly temporal: TemporalContext;
  readonly version?: ResolvedVersion;
}

export function selectLessonAlternate(
  input: SelectLessonAlternateInput
): AlternateLocation {
  for (const alternate of input.alternates) {
    if (alternate.nocturn !== input.nocturn) {
      continue;
    }

    const gate = alternate.alternate.gate;
    if (!gate) {
      return alternate.alternate;
    }

    if (!input.version) {
      continue;
    }

    const matched = conditionMatches(gate, {
      date: normalizeDateInput(input.temporal.date),
      dayOfWeek: input.temporal.dayOfWeek,
      season: input.temporal.season,
      version: input.version
    });
    if (matched) {
      return alternate.alternate;
    }
  }

  return { location: 1 };
}
