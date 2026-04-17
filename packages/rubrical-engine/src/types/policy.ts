import type { ParsedFile, Rank } from '@officium-novum/parser';

import type {
  Candidate,
  FeastReference,
  LiturgicalSeason,
  ResolvedRank,
  TemporalContext
} from './model.js';
import type {
  ConcurrenceResult,
  DayConcurrencePreview,
  VespersSideView
} from './concurrence.js';
import type { DirectoriumOverlay } from './directorium.js';
import type {
  ComplineSource,
  HourDirective,
  PsalmAssignment
} from './hour-structure.js';
import type { Celebration, Commemoration, HourName } from './ordo.js';
import type {
  CelebrationRuleEvaluation,
  CelebrationRuleSet,
  HourRuleSet,
  RuleEvaluationContext
} from './rule-set.js';
import type { MatinsPlan, ScriptureCourse } from './matins.js';
import type { OfficeTextIndex } from './model.js';
import type { CalendarDate } from '../internal/date.js';

/**
 * Stable identifier for a rubrical policy family.
 *
 * Multiple {@link VersionHandle}s can share a single {@link PolicyName} when
 * they run the same rubrics against different calendars — e.g. both
 * `"Rubrics 1960 - 1960"` and `"Rubrics 1960 - 2020 USA"` bind to
 * `'rubrics-1960'` but use different sanctoral tables.
 */
export type PolicyName =
  | 'tridentine-1570'
  | 'divino-afflatu'
  | 'reduced-1955'
  | 'rubrics-1960'
  | 'monastic-tridentine'
  | 'monastic-divino'
  | 'monastic-1963'
  | 'cistercian-1951'
  | 'cistercian-altovadense'
  | 'dominican-1962';

export interface RankContext {
  /** ISO date (`YYYY-MM-DD`) for the office being resolved. */
  readonly date: string;
  /** Stable feast path such as `Tempora/Pasc2-0` or `Sancti/01-25`. */
  readonly feastPath: string;
  /** The emitting cycle for the rank under normalization. */
  readonly source: 'temporal' | 'sanctoral';
  /** Active version handle as it appears in `data.txt`. */
  readonly version: string;
  /** Coarse liturgical season when available. */
  readonly season?: LiturgicalSeason;
}

export class UnsupportedPolicyError extends Error {
  constructor(
    public readonly policyName: string,
    public readonly feature: string
  ) {
    super(
      `Policy '${policyName}' does not implement '${feature}' (deferred to a later sub-phase).`
    );
    this.name = 'UnsupportedPolicyError';
  }
}

export type PrecedenceFate = 'commemorate' | 'omit' | 'transfer';

export interface PrecedenceRow {
  /** The class symbol this row governs, e.g. 'I', 'II', 'III', 'IV'. */
  readonly classSymbol: string;
  /** Numeric weight for comparisons. Higher wins. */
  readonly weight: number;
  /** Citation back to the governing document. */
  readonly citation: string;
  /** What happens when this class loses to a higher-ranked winner. */
  decide(params: {
    readonly candidate: Candidate;
    readonly winner: Candidate;
    readonly temporal: TemporalContext;
    readonly allCandidates: readonly Candidate[];
  }): PrecedenceFate;
}

export interface TemporalPreemption {
  readonly kept: readonly Candidate[];
  readonly suppressed: readonly {
    readonly candidate: Candidate;
    readonly reason: string;
  }[];
}

/**
 * Rubrical behaviour contract for a policy family.
 */
export interface RubricalPolicy {
  /** Stable identifier used in diagnostics, test snapshots, and version projections. */
  readonly name: PolicyName;
  /** Map the raw parser rank into a policy-normalized class symbol and weight. */
  resolveRank(raw: Rank, context: RankContext): ResolvedRank;
  /** Row lookup for the policy's precedence table. Throws if classSymbol is unknown. */
  precedenceRow(classSymbol: string): PrecedenceRow;
  /** Seasonal pre-emption — Triduum, Lent, privileged seasons may suppress candidates. */
  applySeasonPreemption(
    candidates: readonly Candidate[],
    temporal: TemporalContext
  ): TemporalPreemption;
  /** Strict weak ordering over candidates (highest-dignity first). */
  compareCandidates(a: Candidate, b: Candidate): number;
  /** Whether a temporal candidate is a privileged feria under this policy. */
  isPrivilegedFeria(temporal: TemporalContext): boolean;
  /** Evaluate winning-feast [Rule] directives into a typed celebration rule set. */
  buildCelebrationRuleSet(
    feastFile: ParsedFile,
    commemorations: readonly Commemoration[],
    context: RuleEvaluationContext
  ): CelebrationRuleEvaluation;
  /** Compute where an impeded feast may be transferred, if anywhere. */
  transferTarget(
    candidate: Candidate,
    fromDate: CalendarDate,
    until: CalendarDate,
    dayContext: (date: CalendarDate) => TemporalContext,
    overlayFor: (date: CalendarDate) => DirectoriumOverlay,
    occupantOn: (date: CalendarDate) => readonly Candidate[]
  ): CalendarDate | null;
  /** Concurrence decision for a shared Vespers boundary. */
  resolveConcurrence(params: {
    readonly today: VespersSideView;
    readonly tomorrow: VespersSideView;
    readonly temporal: TemporalContext;
  }): ConcurrenceResult;
  /** Select the Compline source once concurrence is known. */
  complineSource(params: {
    readonly concurrence: ConcurrenceResult;
    readonly today: DayConcurrencePreview;
    readonly tomorrow: DayConcurrencePreview;
  }): ComplineSource;
  /** Psalmody selection per §16.2 — Phase 2g-α. */
  selectPsalmody(params: SelectPsalmodyParams): readonly PsalmAssignment[];
  /** Seasonal and rubric-driven hour directives — Phase 2g-α. */
  hourDirectives(params: HourDirectivesParams): ReadonlySet<HourDirective>;
  /**
   * Finalize Matins nocturn/lesson shape under the active policy.
   */
  resolveMatinsShape(params: {
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
    readonly commemorations: readonly Commemoration[];
  }): {
    readonly nocturns: 1 | 3;
    readonly totalLessons: 3 | 9 | 12;
    readonly lessonsPerNocturn: readonly number[];
  };
  /**
   * Decide Te Deum outcome once the Matins plan shape is known.
   */
  resolveTeDeum(params: {
    readonly plan: Pick<MatinsPlan, 'nocturns' | 'totalLessons'>;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
  }): 'say' | 'replace-with-responsory' | 'omit';
  /**
   * Default scripture course (RI §§218-220).
   */
  defaultScriptureCourse(temporal: TemporalContext): ScriptureCourse;
  /** Phase 2g hook — stubbed as `null` in Phase 2c. */
  octavesEnabled(feastRef: FeastReference): null;
}

export interface SelectPsalmodyParams {
  readonly hour: HourName;
  readonly celebration: Celebration;
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly corpus: OfficeTextIndex;
}

export interface HourDirectivesParams {
  readonly hour: HourName;
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly overlay?: DirectoriumOverlay;
}
