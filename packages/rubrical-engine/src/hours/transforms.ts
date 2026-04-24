import type { DirectoriumOverlay } from '../types/directorium.js';
import type { HourDirective } from '../types/hour-structure.js';
import type { TemporalContext } from '../types/model.js';
import type { HourName } from '../types/ordo.js';
import type { CelebrationRuleSet, HourRuleSet } from '../types/rule-set.js';
import { classifyDirective } from '../rules/classify.js';

export interface HourDirectivesInput {
  readonly hour: HourName;
  readonly celebrationRules: CelebrationRuleSet;
  readonly hourRules: HourRuleSet;
  readonly temporal: TemporalContext;
  readonly overlay?: DirectoriumOverlay;
}

/**
 * Seasonal and rubric-driven hour directives under Rubrics 1960.
 *
 * These are directive *emissions* — Phase 3 consumes them when rendering text.
 * Psalter-selection outcomes are NOT encoded here; they live on
 * {@link HourRuleSet.psalterScheme}.
 *
 * Citations refer to *Rubricarum Instructum* (1960).
 */
export function deriveSeasonalDirectives1960(
  params: HourDirectivesInput
): ReadonlySet<HourDirective> {
  const directives = new Set<HourDirective>();
  const { hour, hourRules, temporal, overlay } = params;

  // RI §§104-105: the Alleluia is suppressed from Septuagesima through Lent
  // and inserted at antiphon endings throughout Paschaltide.
  if (temporal.season === 'septuagesima' ||
      temporal.season === 'lent' ||
      temporal.season === 'passiontide') {
    directives.add('omit-alleluia');
  }
  if (temporal.season === 'eastertide' ||
      temporal.season === 'ascensiontide' ||
      temporal.season === 'pentecost-octave') {
    directives.add('add-alleluia');
    directives.add('add-versicle-alleluia');
  }

  // RI §§160-161: the Triduum omits the Gloria Patri and uses the short
  // chapter only.
  if (isTriduum(temporal)) {
    directives.add('omit-gloria-patri');
    directives.add('short-chapter-only');
  }

  // RI §181: preces at Prime are retained only on penitential ferias,
  // vigils of II class, and Ember Days — never as *dominicales*.
  // RI §§180-182: preces at Lauds/Vespers retained on the same days.
  const isFerial = isFerialClass(params.celebrationRules);
  if (shouldSayPreces(hour, temporal, isFerial) && !hourRules.omit.includes('preces')) {
    directives.add('preces-feriales');
  }
  addExplicitRuleDirectives(directives, params);

  // RI §169: the suffragium of the saints is abolished under 1960. The
  // directive is unconditional for Lauds/Vespers; Phase 3 honours it whether
  // or not the slot has been separately suppressed by `hourRules.omit`.
  if (hour === 'lauds' || hour === 'vespers') {
    directives.add('omit-suffragium');
  }

  // RI §118: genuflect at the oration on Ember Wednesdays.
  if (isEmberWednesday(temporal)) {
    directives.add('genuflection-at-oration');
  }

  if (overlay?.dirgeAtVespers && hour === 'vespers') {
    directives.add('dirge-vespers');
  }
  if (overlay?.dirgeAtLauds && hour === 'lauds') {
    directives.add('dirge-lauds');
  }

  return directives;
}

function addExplicitRuleDirectives(
  directives: Set<HourDirective>,
  params: HourDirectivesInput
): void {
  for (const scoped of params.celebrationRules.hourScopedDirectives) {
    if (scoped.hours && !scoped.hours.includes(params.hour)) {
      continue;
    }

    const classified = classifyDirective(scoped.directive);
    if (
      classified.target === 'hour' &&
      classified.effect.kind === 'hour-flag' &&
      classified.effect.value === 'preces-feriales' &&
      !params.hourRules.omit.includes('preces')
    ) {
      directives.add('preces-feriales');
    }
  }
}

function isTriduum(temporal: TemporalContext): boolean {
  return (
    temporal.dayName === 'Quad6-4' ||
    temporal.dayName === 'Quad6-5' ||
    temporal.dayName === 'Quad6-6'
  );
}

function isEmberWednesday(temporal: TemporalContext): boolean {
  // Ember Wednesdays: Quadp3-3 (Ash Wed — no), but the *actual* Ember Wed
  // sits at Quad1-3, QuatTemp*-3 in Pentecost/September/December seasons.
  // Under 1960 the classification lives in `rank.classSymbol === 'II-ember-day'`
  // plus dayOfWeek 3. This helper is deliberately narrow.
  return temporal.rank.classSymbol === 'II-ember-day' && temporal.dayOfWeek === 3;
}

function isFerialClass(rules: CelebrationRuleSet): boolean {
  // A rough proxy: ferial days do not carry `festumDomini` and are not
  // promoted to a double-class rank. Callers pass their merged rule set.
  return !rules.festumDomini;
}

function shouldSayPreces(
  hour: HourName,
  temporal: TemporalContext,
  isFerial: boolean
): boolean {
  if (!isFerial) {
    return false;
  }

  if (hour === 'lauds' || hour === 'vespers' || hour === 'prime' || hour === 'compline') {
    return (
      temporal.season === 'advent' ||
      temporal.season === 'lent' ||
      temporal.season === 'passiontide' ||
      temporal.rank.classSymbol === 'II-ember-day'
    );
  }

  return false;
}
