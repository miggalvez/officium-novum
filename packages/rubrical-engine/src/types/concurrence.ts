import type { RubricalWarning } from './directorium.js';
import type { TemporalContext } from './model.js';
import type { Celebration, Commemoration } from './ordo.js';
import type { CelebrationRuleSet } from './rule-set.js';

export type VespersClass = 'totum' | 'capitulum' | 'nihil';

export type VespersWinner = 'today' | 'tomorrow';

export interface VespersSideView {
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly vespersClass: VespersClass;
  /**
   * Celebration-rule flag. `false` means the celebration declines to compete
   * for its own side of Vespers regardless of rank.
   */
  readonly hasVespers: boolean;
}

export type ConcurrenceReason =
  | 'today-only-has-vespers'
  | 'tomorrow-only-has-vespers'
  | 'today-higher-rank'
  | 'tomorrow-higher-rank'
  | 'equal-rank-praestantior'
  | 'today-declines-second-vespers'
  | 'tomorrow-declines-first-vespers'
  | 'triduum-special';

export interface ConcurrenceResult {
  readonly winner: VespersWinner;
  /** Which celebration provides the Vespers content. */
  readonly source: Celebration;
  /** The other day's celebration, commemorated at this Vespers (if any). */
  readonly commemorations: readonly Commemoration[];
  /** Traceable reason tag for diagnostics and snapshots. */
  readonly reason: ConcurrenceReason;
  readonly warnings: readonly RubricalWarning[];
}

export interface DayConcurrencePreview {
  /** ISO date (`YYYY-MM-DD`). */
  readonly date: string;
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly commemorations: readonly Commemoration[];
  /** Used when this day appears as "tomorrow" (First Vespers side). */
  readonly firstVespersClass: VespersClass;
  /** Used when this day appears as "today" (Second Vespers side). */
  readonly secondVespersClass: VespersClass;
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;
  readonly temporal: TemporalContext;
}
