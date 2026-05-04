import { applyRuleSet, directivesFromPolicy } from './apply-rule-set.js';
import {
  buildMatinsPlanWithWarnings,
  usesThirdClassSanctoralWeekdayFerialMatinsPsalmody
} from './matins-plan.js';

import type { RubricalWarning } from '../types/directorium.js';
import type { DirectoriumOverlay } from '../types/directorium.js';
import type { HourDirective, HourStructure, SlotContent, SlotName } from '../types/hour-structure.js';
import type { OfficeTextIndex, TemporalContext } from '../types/model.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type { RubricalPolicy } from '../types/policy.js';
import type {
  CelebrationRuleSet,
  HourRuleSet
} from '../types/rule-set.js';
import type { ResolvedVersion } from '../types/version.js';

import type { OrdinariumSkeleton } from './skeleton.js';

export interface StructureMatinsInput {
  readonly skeleton: OrdinariumSkeleton;
  readonly celebration: Celebration;
  readonly commemorations: readonly Commemoration[];
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly policy: RubricalPolicy;
  readonly corpus: OfficeTextIndex;
  readonly overlay?: DirectoriumOverlay;
  readonly version?: ResolvedVersion;
}

export interface StructureMatinsResult {
  readonly hour: HourStructure;
  readonly warnings: readonly RubricalWarning[];
}

export function structureMatins(input: StructureMatinsInput): StructureMatinsResult {
  const warnings: RubricalWarning[] = [];

  const planResult = buildMatinsPlanWithWarnings({
    celebration: input.celebration,
    celebrationRules: input.celebrationRules,
    commemorations: input.commemorations,
    hourRules: input.hourRules,
    temporal: input.temporal,
    policy: input.policy,
    corpus: input.corpus,
    ...(input.version ? { version: input.version } : {}),
    ...(input.overlay?.scriptureTransfer
      ? { overlayScriptureTransfer: input.overlay.scriptureTransfer }
      : {})
  });
  warnings.push(...planResult.warnings);

  const wrapperSkeleton: OrdinariumSkeleton = {
    ...input.skeleton,
    slots: input.skeleton.slots.filter(
      (slot) =>
        slot.name === 'incipit' || slot.name === 'oration' || slot.name === 'conclusion'
    )
  };

  const applied = applyRuleSet({
    hour: 'matins',
    skeleton: wrapperSkeleton,
    celebration: input.celebration,
    commemorations: input.commemorations,
    celebrationRules: input.celebrationRules,
    hourRules: input.hourRules,
    temporal: input.temporal,
    policy: input.policy,
    corpus: input.corpus,
    ...(input.overlay ? { overlay: input.overlay } : {}),
    ...(input.version ? { version: input.version } : {})
  });
  warnings.push(...applied.warnings);

  const slots: Partial<Record<SlotName, SlotContent>> = {
    incipit: applied.slots.incipit ?? { kind: 'empty' },
    invitatory: {
      kind: 'matins-invitatorium',
      source: planResult.plan.invitatorium
    },
    hymn:
      planResult.plan.hymn.kind === 'suppressed'
        ? { kind: 'empty' }
        : {
            kind: 'single-ref',
            ref: planResult.plan.hymn.reference
          },
    psalmody: {
      kind: 'matins-nocturns',
      nocturns: planResult.plan.nocturnPlan
    },
    oration: applied.slots.oration ?? { kind: 'empty' },
    'te-deum': {
      kind: 'te-deum',
      decision: planResult.plan.teDeum
    },
    conclusion: applied.slots.conclusion ?? { kind: 'empty' }
  };

  if (planResult.plan.hymn.kind === 'feast' && planResult.plan.hymn.doxologyVariant) {
    slots['doxology-variant'] = {
      kind: 'single-ref',
      ref: {
        path: 'horas/Latin/Psalterium/Doxologies',
        section: planResult.plan.hymn.doxologyVariant
      }
    };
  }

  const oneNocturnScriptureDirectives: HourDirective[] = [];
  if (usesPaschalOneNocturnScriptureMerge(input)) {
    oneNocturnScriptureDirectives.push('matins-merge-second-third-scripture-lessons');
    if (usesThirdClassSanctoralWeekdayFerialMatinsPsalmody(input)) {
      oneNocturnScriptureDirectives.push('matins-invitatory-paschal-alleluia');
    }
  }

  const directives = [
    ...directivesFromPolicy({
      hour: 'matins',
      skeleton: input.skeleton,
      celebration: input.celebration,
      commemorations: input.commemorations,
      celebrationRules: input.celebrationRules,
      hourRules: input.hourRules,
      temporal: input.temporal,
      policy: input.policy,
      corpus: input.corpus,
      ...(input.overlay ? { overlay: input.overlay } : {}),
      ...(input.version ? { version: input.version } : {})
    }),
    ...oneNocturnScriptureDirectives
  ];

  return {
    hour: {
      hour: 'matins',
      slots,
      directives
    },
    warnings
  };
}

function usesPaschalOneNocturnScriptureMerge(
  input: Pick<StructureMatinsInput, 'celebration' | 'temporal' | 'version'>
): boolean {
  return (
    usesThirdClassSanctoralWeekdayFerialMatinsPsalmody(input) ||
    (input.version?.handle.includes('1960') === true &&
      input.celebration.source === 'temporal' &&
      input.temporal.dayOfWeek === 0 &&
      /^Pasc[1-5]-0$/u.test(input.temporal.dayName))
  );
}
