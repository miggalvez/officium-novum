import type { DayConcurrencePreview } from '../types/concurrence.js';
import type { DirectoriumOverlay, RubricalWarning } from '../types/directorium.js';
import type {
  ComplineSource,
  HourDirective,
  HourStructure,
  SlotContent,
  SlotName
} from '../types/hour-structure.js';
import type { OfficeTextIndex, TemporalContext } from '../types/model.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type {
  CelebrationRuleSet,
  HourRuleSet
} from '../types/rule-set.js';
import type { ResolvedVersion } from '../types/version.js';

import { applyRuleSet, directivesFromPolicy } from './apply-rule-set.js';
import type { OrdinariumSkeleton } from './skeleton.js';

export interface BuildComplineInput {
  readonly concurrence: Parameters<RubricalPolicy['complineSource']>[0]['concurrence'];
  readonly today: DayConcurrencePreview;
  readonly tomorrow: DayConcurrencePreview;
  readonly policy: RubricalPolicy;
  readonly skeleton?: OrdinariumSkeleton;
  readonly celebration?: Celebration;
  readonly commemorations?: readonly Commemoration[];
  readonly celebrationRules?: CelebrationRuleSet;
  readonly hourRules?: HourRuleSet;
  readonly corpus?: OfficeTextIndex;
  readonly overlay?: DirectoriumOverlay;
  readonly version?: ResolvedVersion;
  /**
   * The temporal context of the day whose Compline is being structured.
   * Per design §13.2 Compline follows the Vespers winner — so when concurrence
   * awards tomorrow's First Vespers, the engine supplies `tomorrow.temporal`
   * here. Falls back to `today.temporal` when omitted.
   */
  readonly temporal?: TemporalContext;
}

export interface BuildComplineResult {
  readonly hour: HourStructure;
  readonly warnings: readonly RubricalWarning[];
}

export function buildCompline(input: BuildComplineInput): HourStructure {
  return buildComplineWithWarnings(input).hour;
}

/**
 * Full Compline builder: returns both the structure and any warnings raised
 * during slot resolution. `buildCompline` remains the terse, compatible entry
 * point.
 */
export function buildComplineWithWarnings(
  input: BuildComplineInput
): BuildComplineResult {
  const source = input.policy.complineSource({
    concurrence: input.concurrence,
    today: input.today,
    tomorrow: input.tomorrow
  });

  const baseDirectives = deriveComplineBaseDirectives(
    source,
    input.today,
    input.tomorrow,
    input.policy
  );

  const slotsState = maybeApplyFullSlots(input, source);
  const directives = mergeDirectives(baseDirectives, slotsState.directives);

  return {
    hour: {
      hour: 'compline',
      source,
      slots: slotsState.slots,
      directives
    },
    warnings: slotsState.warnings
  };
}

interface SlotsState {
  readonly slots: Readonly<Partial<Record<SlotName, SlotContent>>>;
  readonly directives: readonly HourDirective[];
  readonly warnings: readonly RubricalWarning[];
}

function maybeApplyFullSlots(
  input: BuildComplineInput,
  source: ComplineSource
): SlotsState {
  if (!canBuildFullStructure(input)) {
    return { slots: {}, directives: [], warnings: [] };
  }

  const skeleton = input.skeleton;
  const celebration = input.celebration;
  const celebrationRules = input.celebrationRules;
  const hourRules = input.hourRules;
  const corpus = input.corpus;
  if (!skeleton || !celebration || !celebrationRules || !hourRules || !corpus) {
    return { slots: {}, directives: [], warnings: [] };
  }

  // Per §13.2 Compline follows the Vespers winner; the caller may have
  // threaded tomorrow's temporal context here when First Vespers wins.
  const temporal = input.temporal ?? input.today.temporal;

  const applied = applyRuleSet({
    hour: 'compline',
    skeleton,
    celebration,
    commemorations: input.commemorations ?? [],
    celebrationRules,
    hourRules,
    temporal,
    policy: input.policy,
    corpus,
    ...(input.overlay ? { overlay: input.overlay } : {}),
    ...(input.version ? { version: input.version } : {}),
    ...(input.concurrence.winner === 'tomorrow' ? { __ordinaryComplineSlots: true } : {})
  });

  const directives = directivesFromPolicy({
    hour: 'compline',
    skeleton,
    celebration,
    commemorations: input.commemorations ?? [],
    celebrationRules,
    hourRules,
    temporal,
    policy: input.policy,
    corpus,
    ...(input.overlay ? { overlay: input.overlay } : {}),
    ...(input.version ? { version: input.version } : {})
  });

  if (source.kind === 'triduum-special') {
    // Triduum Compline uses the short-office variant; slot resolution still
    // runs but we flag the short-chapter directive here too.
    return {
      slots: applied.slots,
      directives,
      warnings: applied.warnings
    };
  }

  return {
    slots: applied.slots,
    directives,
    warnings: applied.warnings
  };
}

function canBuildFullStructure(input: BuildComplineInput): boolean {
  return Boolean(
    input.skeleton &&
      input.celebration &&
      input.celebrationRules &&
      input.hourRules &&
      input.corpus
  );
}

function deriveComplineBaseDirectives(
  source: ComplineSource,
  today: DayConcurrencePreview,
  tomorrow: DayConcurrencePreview,
  policy: RubricalPolicy
): readonly HourDirective[] {
  if (source.kind === 'triduum-special') {
    return ['omit-gloria-patri', 'short-chapter-only'];
  }

  if (source.kind !== 'vespers-winner') {
    return [];
  }

  const sourceDate = source.celebration.feastRef.path === tomorrow.celebration.feastRef.path
    ? tomorrow
    : today;
  if (policy.name === 'rubrics-1960' && isPaschaltideSunday(sourceDate.temporal)) {
    return [];
  }

  if (sourceDate.temporal.dayOfWeek === 0) {
    return ['preces-dominicales'];
  }

  return [];
}

function isPaschaltideSunday(temporal: TemporalContext): boolean {
  return (
    temporal.dayOfWeek === 0 &&
    (temporal.season === 'eastertide' || temporal.season === 'ascensiontide')
  );
}

function mergeDirectives(
  base: readonly HourDirective[],
  added: readonly HourDirective[]
): readonly HourDirective[] {
  const merged = new Set<HourDirective>(base);
  for (const directive of added) {
    merged.add(directive);
  }
  return Object.freeze([...merged]);
}
