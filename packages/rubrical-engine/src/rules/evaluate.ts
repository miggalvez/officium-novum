import type { ParsedFile, RuleDirective } from '@officium-novum/parser';

import { conditionMatches } from '../internal/conditions.js';
import type { RubricalWarning } from '../types/directorium.js';
import type {
  CelebrationRuleEvaluation,
  CelebrationRuleSet,
  HourScopedDirective,
  RuleEvaluationContext
} from '../types/rule-set.js';

import { classifyDirective, type CelebrationEffect, type HourEffect } from './classify.js';
import { freezeCelebrationRuleSet, mergeCommemoratedLessonRules } from './merge.js';
import { extractRuleDirectives, resolveEx, resolveVide } from './resolve-vide-ex.js';

interface CelebrationRuleBuilder {
  matins: CelebrationRuleSet['matins'];
  hasFirstVespers: boolean;
  hasSecondVespers: boolean;
  lessonSources: CelebrationRuleSet['lessonSources'];
  lessonSetAlternates: CelebrationRuleSet['lessonSetAlternates'];
  teDeumOverride?: CelebrationRuleSet['teDeumOverride'];
  festumDomini: boolean;
  papalNames?: CelebrationRuleSet['papalNames'];
  conclusionMode: CelebrationRuleSet['conclusionMode'];
  antiphonScheme: CelebrationRuleSet['antiphonScheme'];
  doxologyVariant?: string;
  omitCommemoration: boolean;
  comkey?: string;
  suffragium?: string;
  noSuffragium: boolean;
  quorumFestum: boolean;
  commemoratio3: boolean;
  unaAntiphona: boolean;
  unmapped: RuleDirective[];
  hourScopedDirectives: HourScopedDirective[];
}

export function buildCelebrationRuleSet(
  feastFile: ParsedFile,
  commemorations: readonly RuleEvaluationContext['commemorations'][number][],
  context: RuleEvaluationContext
): CelebrationRuleEvaluation {
  const warnings: RubricalWarning[] = [];
  const ownRules = extractRuleDirectives(feastFile);

  const exResolved = resolveEx(feastFile, context);
  warnings.push(...exResolved.warnings);

  const ownWithoutReferences = ownRules.filter((directive) => !isVideOrExDirective(directive));
  const videResolved = resolveVide(feastFile, [...exResolved.directives, ...ownWithoutReferences], context);
  warnings.push(...videResolved.warnings);

  // Merge order is intentional: ex base -> vide selective fallback -> feast's own rules.
  // Later contributors override earlier ones per design §12.3.
  const directives = [...exResolved.directives, ...videResolved.directives, ...ownWithoutReferences];
  const builder = defaultCelebrationRuleBuilder();

  for (const directive of directives) {
    if (!conditionMatches(directive.condition, context)) {
      continue;
    }

    const classified = classifyDirective(directive);

    switch (classified.target) {
      case 'celebration':
        applyCelebrationEffect(builder, classified.effect);
        break;
      case 'hour':
        applyHourEffect(builder, directive, classified.effect);
        break;
      case 'missa':
        warnings.push({
          code: 'rule-missa-passthrough',
          message: 'Directive reserved for Missa processing; preserved as pass-through.',
          severity: 'info',
          context: {
            directive: directive.raw,
            feast: feastFile.path
          }
        });
        break;
      case 'unmapped':
        builder.unmapped.push(directive);
        warnings.push({
          code: 'rule-unmapped',
          message: 'Rule directive is not mapped to a known celebration/hour slot.',
          severity: 'warn',
          context: {
            directive: directive.raw,
            feast: feastFile.path
          }
        });
        break;
    }
  }

  const baseRuleSet = freezeCelebrationRuleSet({
    matins: builder.matins,
    hasFirstVespers: builder.hasFirstVespers,
    hasSecondVespers: builder.hasSecondVespers,
    lessonSources: builder.lessonSources,
    lessonSetAlternates: builder.lessonSetAlternates,
    ...(builder.teDeumOverride ? { teDeumOverride: builder.teDeumOverride } : {}),
    festumDomini: builder.festumDomini,
    ...(builder.papalNames ? { papalNames: builder.papalNames } : {}),
    conclusionMode: builder.conclusionMode,
    antiphonScheme: builder.antiphonScheme,
    ...(builder.doxologyVariant ? { doxologyVariant: builder.doxologyVariant } : {}),
    omitCommemoration: builder.omitCommemoration,
    ...(builder.comkey ? { comkey: builder.comkey } : {}),
    ...(builder.suffragium ? { suffragium: builder.suffragium } : {}),
    noSuffragium: builder.noSuffragium,
    quorumFestum: builder.quorumFestum,
    commemoratio3: builder.commemoratio3,
    unaAntiphona: builder.unaAntiphona,
    unmapped: builder.unmapped,
    hourScopedDirectives: builder.hourScopedDirectives
  });

  const withCommemoratedLessons = mergeCommemoratedLessonRules(baseRuleSet, commemorations);

  return {
    celebrationRules: withCommemoratedLessons,
    warnings: Object.freeze([...warnings])
  };
}

function defaultCelebrationRuleBuilder(): CelebrationRuleBuilder {
  return {
    matins: {
      lessonCount: 9,
      nocturns: 3,
      rubricGate: 'always'
    },
    hasFirstVespers: true,
    hasSecondVespers: true,
    lessonSources: [],
    lessonSetAlternates: [],
    festumDomini: false,
    conclusionMode: 'separate',
    antiphonScheme: 'default',
    omitCommemoration: false,
    noSuffragium: false,
    quorumFestum: false,
    commemoratio3: false,
    unaAntiphona: false,
    unmapped: [],
    hourScopedDirectives: []
  };
}

function applyCelebrationEffect(builder: CelebrationRuleBuilder, effect: CelebrationEffect): void {
  switch (effect.kind) {
    case 'matins':
      builder.matins = effect.value;
      break;
    case 'first-vespers':
      builder.hasFirstVespers = effect.value;
      break;
    case 'second-vespers':
      builder.hasSecondVespers = effect.value;
      break;
    case 'lesson-source': {
      const index = builder.lessonSources.findIndex((entry) => entry.lesson === effect.value.lesson);
      if (index >= 0) {
        const next = [...builder.lessonSources];
        next[index] = effect.value;
        builder.lessonSources = next;
      } else {
        builder.lessonSources = [...builder.lessonSources, effect.value];
      }
      break;
    }
    case 'lesson-set-alternate': {
      const index = builder.lessonSetAlternates.findIndex(
        (entry) => entry.nocturn === effect.value.nocturn
      );
      if (index >= 0) {
        const next = [...builder.lessonSetAlternates];
        next[index] = effect.value;
        builder.lessonSetAlternates = next;
      } else {
        builder.lessonSetAlternates = [...builder.lessonSetAlternates, effect.value];
      }
      break;
    }
    case 'te-deum':
      builder.teDeumOverride = effect.value;
      break;
    case 'festum-domini':
      builder.festumDomini = true;
      break;
    case 'papal-office-name':
      builder.papalNames = {
        ...builder.papalNames,
        office: effect.value
      };
      break;
    case 'papal-commemoration-name':
      builder.papalNames = {
        ...builder.papalNames,
        commemoration: effect.value
      };
      break;
    case 'conclusion-mode':
      builder.conclusionMode = effect.value;
      break;
    case 'antiphon-scheme':
      builder.antiphonScheme = effect.value;
      break;
    case 'doxology':
      builder.doxologyVariant = effect.value;
      break;
    case 'omit-commemoration':
      builder.omitCommemoration = true;
      break;
    case 'comkey':
      builder.comkey = effect.value;
      break;
    case 'suffragium':
      builder.suffragium = effect.value;
      builder.noSuffragium = false;
      break;
    case 'no-suffragium':
      builder.noSuffragium = true;
      builder.suffragium = undefined;
      break;
    case 'quorum-festum':
      builder.quorumFestum = true;
      break;
    case 'commemoratio3':
      builder.commemoratio3 = true;
      break;
    case 'una-antiphona':
      builder.unaAntiphona = true;
      break;
  }
}

function applyHourEffect(
  builder: CelebrationRuleBuilder,
  directive: RuleDirective,
  effect: HourEffect
): void {
  if (effect.kind === 'omit' && effect.omitCommemoration) {
    builder.omitCommemoration = true;
  }

  if (effect.kind === 'omit' && effect.slots.length === 0) {
    return;
  }

  builder.hourScopedDirectives.push({
    directive,
    ...(effect.hours ? { hours: effect.hours } : {})
  });
}

function isVideOrExDirective(directive: RuleDirective): boolean {
  if (directive.kind !== 'action') {
    return false;
  }

  const keyword = directive.keyword.trim().toLowerCase();
  return keyword === 'vide' || keyword === 'ex';
}
