import type { RuleDirective } from '@officium-novum/parser';

import { classifyDirective, type HourEffect } from './classify.js';

import type { Celebration, Commemoration, HourName } from '../types/ordo.js';
import type {
  CelebrationRuleSet,
  HourRuleSet,
  HourScopedDirective,
  OmittableSlot,
  PsalmOverride,
  PsalterScheme
} from '../types/rule-set.js';

export interface CelebrationRulePatch {
  readonly matins?: CelebrationRuleSet['matins'];
  readonly hasFirstVespers?: boolean;
  readonly hasSecondVespers?: boolean;
  readonly lessonSources?: CelebrationRuleSet['lessonSources'];
  readonly lessonSetAlternates?: CelebrationRuleSet['lessonSetAlternates'];
  readonly teDeumOverride?: CelebrationRuleSet['teDeumOverride'];
  readonly festumDomini?: boolean;
  readonly papalNames?: CelebrationRuleSet['papalNames'];
  readonly conclusionMode?: CelebrationRuleSet['conclusionMode'];
  readonly antiphonScheme?: CelebrationRuleSet['antiphonScheme'];
  readonly doxologyVariant?: string;
  readonly omitCommemoration?: boolean;
  readonly comkey?: string;
  readonly suffragium?: string;
  readonly noSuffragium?: boolean;
  readonly quorumFestum?: boolean;
  readonly commemoratio3?: boolean;
  readonly unaAntiphona?: boolean;
  readonly unmapped?: readonly RuleDirective[];
  readonly hourScopedDirectives?: readonly HourScopedDirective[];
}

export function mergeFeastRules(
  base: CelebrationRuleSet,
  patch: CelebrationRulePatch
): CelebrationRuleSet {
  return freezeCelebrationRuleSet({
    matins: patch.matins ?? base.matins,
    hasFirstVespers: patch.hasFirstVespers ?? base.hasFirstVespers,
    hasSecondVespers: patch.hasSecondVespers ?? base.hasSecondVespers,
    lessonSources: patch.lessonSources ?? base.lessonSources,
    lessonSetAlternates: patch.lessonSetAlternates ?? base.lessonSetAlternates,
    teDeumOverride: patch.teDeumOverride ?? base.teDeumOverride,
    festumDomini: patch.festumDomini ?? base.festumDomini,
    papalNames: patch.papalNames ?? base.papalNames,
    conclusionMode: patch.conclusionMode ?? base.conclusionMode,
    antiphonScheme: patch.antiphonScheme ?? base.antiphonScheme,
    doxologyVariant: patch.doxologyVariant ?? base.doxologyVariant,
    omitCommemoration: patch.omitCommemoration ?? base.omitCommemoration,
    comkey: patch.comkey ?? base.comkey,
    suffragium: patch.suffragium ?? base.suffragium,
    noSuffragium: patch.noSuffragium ?? base.noSuffragium,
    quorumFestum: patch.quorumFestum ?? base.quorumFestum,
    commemoratio3: patch.commemoratio3 ?? base.commemoratio3,
    unaAntiphona: patch.unaAntiphona ?? base.unaAntiphona,
    unmapped: patch.unmapped ?? base.unmapped,
    hourScopedDirectives: patch.hourScopedDirectives ?? base.hourScopedDirectives
  });
}

export function mergeCommemoratedLessonRules(
  rules: CelebrationRuleSet,
  commemorations: readonly Commemoration[]
): CelebrationRuleSet {
  if (commemorations.length === 0 || rules.matins.lessonCount < 9) {
    return rules;
  }

  const hasExplicitNinth = rules.lessonSources.some((override) => override.lesson === 9);
  if (hasExplicitNinth) {
    return rules;
  }

  return mergeFeastRules(rules, {
    lessonSources: freezeArray([...rules.lessonSources, { lesson: 9, source: 'commemorated-principal' }])
  });
}

export function deriveHourRuleSet(
  _celebration: Celebration,
  celebrationRules: CelebrationRuleSet,
  hour: HourName,
  ordinariumRules: readonly HourScopedDirective[] = []
): HourRuleSet {
  const omit: OmittableSlot[] = [];
  let psalterScheme: PsalterScheme = 'ferial';
  const psalmOverrides: PsalmOverride[] = [];
  let matinsLessonIntroduction: HourRuleSet['matinsLessonIntroduction'] = 'ordinary';
  let minorHoursSineAntiphona = false;
  let minorHoursFerialPsalter = false;
  let capitulumVariant: HourRuleSet['capitulumVariant'];

  const mergedScopes = [...ordinariumRules, ...celebrationRules.hourScopedDirectives];
  for (const scoped of mergedScopes) {
    if (!appliesToHour(scoped.hours, hour)) {
      continue;
    }

    const classified = classifyDirective(scoped.directive);
    if (classified.target !== 'hour') {
      continue;
    }

    const effect = classified.effect;
    if (!hourEffectApplies(effect, hour)) {
      continue;
    }

    switch (effect.kind) {
      case 'omit':
        for (const slot of effect.slots) {
          if (!omit.includes(slot)) {
            omit.push(slot);
          }
        }
        break;
      case 'psalter-scheme':
        psalterScheme = effect.value;
        break;
      case 'psalm-override': {
        const existing = psalmOverrides.findIndex((override) => override.key === effect.key);
        const next: PsalmOverride = {
          key: effect.key,
          value: effect.value
        };

        if (existing >= 0) {
          psalmOverrides[existing] = next;
        } else {
          psalmOverrides.push(next);
        }
        break;
      }
      case 'matins-lesson-introduction':
        matinsLessonIntroduction = effect.value;
        break;
      case 'minor-hours-sine-antiphona':
        minorHoursSineAntiphona = true;
        break;
      case 'minor-hours-ferial-psalter':
        minorHoursFerialPsalter = true;
        break;
      case 'capitulum-variant':
        capitulumVariant = effect.value;
        break;
      case 'horas1960-feria':
        psalterScheme = 'ferial';
        break;
      case 'hour-flag':
        break;
    }
  }

  if (celebrationRules.noSuffragium && !omit.includes('suffragium')) {
    omit.push('suffragium');
  }

  return freezeHourRuleSet({
    hour,
    omit: freezeArray(omit),
    psalterScheme,
    psalmOverrides: freezeArray(psalmOverrides),
    matinsLessonIntroduction,
    minorHoursSineAntiphona,
    minorHoursFerialPsalter,
    ...(capitulumVariant ? { capitulumVariant } : {})
  });
}

function appliesToHour(hours: readonly HourName[] | undefined, hour: HourName): boolean {
  return !hours || hours.includes(hour);
}

function hourEffectApplies(effect: HourEffect, hour: HourName): boolean {
  return !effect.hours || effect.hours.includes(hour);
}

export function freezeCelebrationRuleSet(ruleSet: CelebrationRuleSet): CelebrationRuleSet {
  return Object.freeze({
    ...ruleSet,
    lessonSources: freezeArray(ruleSet.lessonSources),
    lessonSetAlternates: freezeArray(ruleSet.lessonSetAlternates),
    unmapped: freezeArray(ruleSet.unmapped),
    hourScopedDirectives: freezeArray(ruleSet.hourScopedDirectives)
  });
}

function freezeHourRuleSet(ruleSet: HourRuleSet): HourRuleSet {
  return Object.freeze({
    ...ruleSet,
    omit: freezeArray(ruleSet.omit),
    psalmOverrides: freezeArray(ruleSet.psalmOverrides)
  });
}

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}
