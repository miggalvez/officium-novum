import { parseFile, type ParsedFile } from '@officium-novum/parser';

import type { CalendarDate } from '../internal/date.js';
import { formatIsoDate } from '../internal/date.js';
import type { DayConcurrencePreview } from '../types/concurrence.js';
import type { TemporalContext } from '../types/model.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type { CelebrationRuleSet } from '../types/rule-set.js';

import { deriveVespersClass } from './vespers-class.js';

export interface DayPreviewSummaryInput {
  readonly date: string;
  readonly temporal: TemporalContext;
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
}

export interface DayPreviewInternals {
  readonly policy: RubricalPolicy;
  readonly resolveSummary: (date: CalendarDate) => DayPreviewSummaryInput;
  readonly resolveFeastFile: (path: string) => ParsedFile;
}

export function buildConcurrencePreview(
  date: CalendarDate,
  internals: DayPreviewInternals
): DayConcurrencePreview {
  const summary = internals.resolveSummary(date);
  const feastFile = resolveFeastFileWithFallback(internals, summary);
  // 1960 uses one Vespers-class value for both first and second sides.
  // Side-specific class divergence is deferred to later policy phases.
  const vespersClass = deriveVespersClass({
    celebration: summary.celebration,
    celebrationRules: summary.celebrationRules,
    feastFile,
    policy: internals.policy
  });

  return {
    date: summary.date || formatIsoDate(date),
    temporal: summary.temporal,
    celebration: summary.celebration,
    celebrationRules: summary.celebrationRules,
    commemorations: summary.commemorations,
    firstVespersClass: vespersClass,
    secondVespersClass: vespersClass,
    hasFirstVespers: summary.celebrationRules.hasFirstVespers,
    hasSecondVespers: summary.celebrationRules.hasSecondVespers
  };
}

function resolveFeastFileWithFallback(
  internals: DayPreviewInternals,
  summary: DayPreviewSummaryInput
): ParsedFile {
  try {
    return internals.resolveFeastFile(summary.celebration.feastRef.path);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Corpus file not found for office path:')) {
      throw error;
    }

    return parseFile(
      ['[Officium]', summary.celebration.feastRef.title].join('\n'),
      `horas/Latin/${summary.celebration.feastRef.path}.txt`
    );
  }
}
