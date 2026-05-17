import { lookupVespersDivinoAfflatuRow } from '../concurrence/tables/vespers-divino-afflatu.js';
import { selectPsalmodyRoman1960 } from '../hours/psalter.js';
import {
  PRECEDENCE_DIVINO_AFFLATU_BY_CLASS,
  type ClassSymbolDivinoAfflatu
} from '../occurrence/tables/precedence-divino-afflatu.js';
import {
  compareRomanCandidates,
  collapseSameDayCommemorations,
  defaultRomanScriptureCourse,
  deriveSeasonalDirectivesRomanPre1960,
  forbidsTransferIntoRoman,
  isAshWednesdayOrHolyWeekMonWed,
  isEmberDay,
  isPaschalOctaveDay,
  isPentecostOctaveDay,
  isTriduumDay,
  limitCommemorationsByHour,
  romanComplineSource,
  romanImmaculateException,
  rootFeastMatches
} from './_shared/roman.js';
import { buildCelebrationRuleSet as defaultBuildCelebrationRuleSet } from '../rules/evaluate.js';
import { mergeFeastRules } from '../rules/merge.js';
import { divinoAfflatuResolveRank } from '../sanctoral/rank-normalizer.js';
import { walkTransferTargetDate } from '../transfer/compute.js';
import type { FeastVespersSignals } from '../concurrence/vespers-class.js';
import type {
  ConcurrenceResult,
  DayConcurrencePreview,
  VespersClass,
  VespersSideView
} from '../types/concurrence.js';
import type {
  ComplineSource,
  HourDirective,
  PsalmAssignment
} from '../types/hour-structure.js';
import { selectRomanBenedictions } from './_shared/roman.js';
import type { BenedictioEntry, LessonPlan, MatinsPlan, ScriptureCourse } from '../types/matins.js';
import type {
  Candidate,
  FeastReference,
  TemporalContext
} from '../types/model.js';
import type { Celebration, Commemoration, HourName } from '../types/ordo.js';
import type {
  HourDirectivesParams,
  OctaveRule,
  PrecedenceRow,
  RubricalPolicy,
  SelectPsalmodyParams
} from '../types/policy.js';
import type { CelebrationRuleSet } from '../types/rule-set.js';

const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const THREE_NOCTURN_CLASSES = new Set([
  'privileged-triduum',
  'privileged-feria-major',
  'privileged-sunday',
  'sunday',
  'duplex-i',
  'duplex-ii',
  'duplex-major',
  'duplex',
  'semiduplex',
  'octave-major',
  'octave',
  'vigil-major'
]);
const PRIVILEGED_OCTAVES = new Set<string>([
  'Sancti/12-25',
  'Tempora/Pasc0-0',
  'Tempora/Pasc7-0'
]);
const COMMON_OCTAVES = new Set<string>([
  'Sancti/01-06',
  'Tempora/Pasc5-4',
  'Sancti/06-29',
  'Sancti/08-15',
  'Sancti/12-08'
]);
const NO_COMMEMORATION_FEASTS = new Set<string>([
  'Sancti/01-01',
  'Sancti/01-06',
  'Sancti/12-24',
  'Sancti/12-25',
  'Tempora/Pasc0-0',
  'Tempora/Pasc5-4',
  'Tempora/Pasc7-0',
  'Tempora/Pent01-4',
  'Tempora/Nat25'
]);

export const divinoAfflatuPolicy: RubricalPolicy = {
  name: 'divino-afflatu',
  resolveRank: divinoAfflatuResolveRank,
  precedenceRow(classSymbol: string): PrecedenceRow {
    const row = PRECEDENCE_DIVINO_AFFLATU_BY_CLASS.get(classSymbol as ClassSymbolDivinoAfflatu);
    if (!row) {
      throw new Error(`Unknown Divino Afflatu class symbol: ${classSymbol}`);
    }
    return row;
  },
  applySeasonPreemption(candidates: readonly Candidate[], temporal: TemporalContext) {
    if (!isTriduumDay(temporal)) {
      return {
        kept: [...candidates],
        suppressed: []
      };
    }

    const kept: Candidate[] = [];
    const suppressed: Array<{ readonly candidate: Candidate; readonly reason: string }> = [];
    for (const candidate of candidates) {
      if (candidate.source === 'temporal') {
        kept.push(candidate);
        continue;
      }
      suppressed.push({
        candidate,
        reason:
          'The Sacred Triduum keeps the temporal office without sanctoral concurrence.'
      });
    }

    return { kept, suppressed };
  },
  compareCandidates(a: Candidate, b: Candidate): number {
    const emberCompared = compareEmberFeriaAgainstVigil(a, b);
    if (emberCompared !== null) {
      return emberCompared;
    }

    const ordinarySundayCompared = compareOrdinarySundayAgainstMajorDouble(a, b);
    if (ordinarySundayCompared !== null) {
      return ordinarySundayCompared;
    }

    return compareRomanCandidates(a, b, {
      privilegedTemporalWins(temporal, sanctoral) {
        if (
          temporal.rank.classSymbol === 'privileged-triduum' ||
          temporal.rank.classSymbol === 'privileged-feria-major'
        ) {
          return true;
        }

        if (temporal.rank.classSymbol === 'privileged-sunday') {
          return romanImmaculateException(temporal, sanctoral) ? false : true;
        }

        return null;
      }
    });
  },
  resolveConcurrence(params: {
    readonly today: VespersSideView;
    readonly tomorrow: VespersSideView;
    readonly temporal: TemporalContext;
  }): ConcurrenceResult {
    if (
      isChristmasOctaveSequencePath(params.today.celebration.feastRef.path) &&
      isChristmasOctaveSequencePath(params.tomorrow.celebration.feastRef.path)
    ) {
      return {
        winner: 'today',
        source: params.today.celebration,
        commemorations: [toConcurrenceCommemoration(params.tomorrow.celebration)],
        reason: 'today-higher-rank',
        warnings: []
      };
    }

    if (
      params.today.celebration.rank.classSymbol === 'privileged-sunday' &&
      params.tomorrow.celebration.transferredFrom === params.temporal.date
    ) {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [],
        reason: 'tomorrow-higher-rank',
        warnings: []
      };
    }

    if (
      (params.today.celebration.rank.classSymbol === 'sunday' ||
        params.today.celebration.rank.classSymbol === 'semiduplex') &&
      isMajorFollowingDouble(params.tomorrow.celebration)
    ) {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [toConcurrenceCommemoration(params.today.celebration)],
        reason: 'tomorrow-higher-rank',
        warnings: []
      };
    }

    const row = lookupVespersDivinoAfflatuRow(
      params.today.celebration.rank.classSymbol,
      params.tomorrow.celebration.rank.classSymbol
    );

    if (row.winner === 'today') {
      return {
        winner: 'today',
        source: params.today.celebration,
        commemorations: [toConcurrenceCommemoration(params.tomorrow.celebration)],
        reason: 'today-higher-rank',
        warnings: []
      };
    }

    if (row.winner === 'tomorrow') {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [toConcurrenceCommemoration(params.today.celebration)],
        reason: 'tomorrow-higher-rank',
        warnings: []
      };
    }

    if (
      row.winner === 'equal' &&
      isDoubleClass(params.today.celebration.rank.classSymbol) &&
      isDoubleClass(params.tomorrow.celebration.rank.classSymbol)
    ) {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [toConcurrenceCommemoration(params.today.celebration)],
        reason: 'equal-rank-praestantior',
        warnings: []
      };
    }

    const compared = divinoAfflatuPolicy.compareCandidates(
      toCandidate(params.today.celebration),
      toCandidate(params.tomorrow.celebration)
    );
    if (compared < 0) {
      return {
        winner: 'today',
        source: params.today.celebration,
        commemorations: [toConcurrenceCommemoration(params.tomorrow.celebration)],
        reason: 'today-higher-rank',
        warnings: []
      };
    }

    if (compared > 0) {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [toConcurrenceCommemoration(params.today.celebration)],
        reason: 'tomorrow-higher-rank',
        warnings: []
      };
    }

    return {
      winner: 'today',
      source: params.today.celebration,
      commemorations: [toConcurrenceCommemoration(params.tomorrow.celebration)],
      reason: 'equal-rank-praestantior',
      warnings: [
        {
          code: 'concurrence-praestantior-tie',
          message: 'Equal-rank pre-1955 concurrence resolved in favor of today.',
          severity: 'info',
          context: {
            todayClass: params.today.celebration.rank.classSymbol,
            tomorrowClass: params.tomorrow.celebration.rank.classSymbol,
            citation: row.citation
          }
        }
      ]
    };
  },
  complineSource(params: {
    readonly concurrence: ConcurrenceResult;
    readonly today: DayConcurrencePreview;
    readonly tomorrow: DayConcurrencePreview;
  }): ComplineSource {
    return romanComplineSource(params);
  },
  isPrivilegedFeria(temporal: TemporalContext): boolean {
    return (
      temporal.dayName === 'Quadp3-3' ||
      HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName) ||
      temporal.date.endsWith('-12-24') ||
      temporal.rank.classSymbol === 'privileged-feria-major'
    );
  },
  buildCelebrationRuleSet(feastFile, commemorations, context) {
    const base = defaultBuildCelebrationRuleSet(feastFile, commemorations, context);
    let celebrationRules = base.celebrationRules;

    // The Triduum does not keep ordinary Vespers concurrence, and Holy
    // Saturday yields its evening office to Easter.
    if (
      context.dayName === 'Quad6-4' ||
      context.dayName === 'Quad6-5' ||
      context.dayName === 'Quad6-6'
    ) {
      celebrationRules = mergeFeastRules(celebrationRules, {
        hasFirstVespers: false,
        hasSecondVespers: false
      });
    }

    if (
      context.celebration.source === 'temporal' &&
      ((context.celebration.rank.classSymbol === 'feria' ||
        context.celebration.rank.classSymbol === 'privileged-feria-major') ||
        isPaschalOrPentecostOctaveWeekday(context.celebration.feastRef.path))
    ) {
      celebrationRules = mergeFeastRules(celebrationRules, {
        hasFirstVespers: false
      });
    }

    if (context.celebration.rank.classSymbol === 'simplex') {
      celebrationRules = mergeFeastRules(celebrationRules, {
        hasSecondVespers: false
      });
    }

    return {
      celebrationRules,
      warnings: base.warnings
    };
  },
  transferTarget(candidate, fromDate, until, dayContext, overlayFor, occupantOn) {
    return walkTransferTargetDate({
      impeded: candidate,
      fromDate,
      until,
      dayContext,
      overlayFor,
      occupantOn,
      compareCandidates: divinoAfflatuPolicy.compareCandidates,
      forbidsTransferInto(impeded, temporal) {
        return forbidsTransferIntoRoman(impeded, temporal, {
          suppressChristmasOctave: true
        });
      }
    });
  },
  selectPsalmody(params: SelectPsalmodyParams): readonly PsalmAssignment[] {
    return selectPsalmodyRoman1960({
      policyName: 'divino-afflatu',
      hour: params.hour,
      celebration: params.celebration,
      celebrationRules: params.celebrationRules,
      hourRules: params.hourRules,
      temporal: params.temporal,
      corpus: params.corpus,
      vespersSide: params.vespersSide
    });
  },
  hourDirectives(params: HourDirectivesParams): ReadonlySet<HourDirective> {
    return deriveSeasonalDirectivesRomanPre1960(params);
  },
  limitCommemorations(
    commemorations: readonly Commemoration[],
    params
  ): readonly Commemoration[] {
    if (NO_COMMEMORATION_FEASTS.has(params.celebration.feastRef.path)) {
      return [];
    }

    if (
      (isPaschalOctaveDay(params.temporal) || isPentecostOctaveDay(params.temporal)) &&
      params.temporal.dayOfWeek <= 3
    ) {
      return [];
    }

    const laudsVespersLimit =
      params.temporal.dayOfWeek === 0 ||
      params.celebration.rank.classSymbol === 'duplex-i' ||
      params.celebration.rank.classSymbol === 'privileged-sunday' ||
      params.celebration.rank.classSymbol === 'privileged-feria-major'
        ? 2
        : commemorations.length;
    const hasOptionalVariant = commemorations.some((entry) => /o$/u.test(entry.feastRef.path));
    const scoped =
      hasOptionalVariant || laudsVespersLimit < commemorations.length
        ? collapseSameDayCommemorations(commemorations)
        : commemorations;
    if (scoped.length === 0) {
      return scoped;
    }

    const matinsLimit = laudsVespersLimit > 0 ? 1 : 0;
    return limitCommemorationsByHour(scoped, laudsVespersLimit, matinsLimit);
  },
  // Phase 3 §3e: Divino Afflatu retains Matins commemorations per Rubricae
  // Generales §IX. The `limitCommemorationsByHour` above already handles the
  // per-Hour capping; `defaultCommemorationHours` here stamps Matins onto
  // every `Commemoration` so downstream filtering sees it as eligible.
  defaultCommemorationHours(): readonly HourName[] {
    return ['matins', 'lauds', 'vespers'];
  },
  commemoratesAtHour(params: {
    readonly hour: HourName;
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
  }): boolean {
    return params.hour === 'matins' || params.hour === 'lauds' || params.hour === 'vespers';
  },
  resolveMatinsShape(params) {
    if (
      isPaschalOctaveDay(params.temporal) ||
      isPentecostOctaveDay(params.temporal)
    ) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      } as const;
    }

    if (isAshWednesdayOrHolyWeekMonWed(params.temporal)) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      } as const;
    }

    if (isEmberDay(params.temporal) || params.celebration.feastRef.path === 'Sancti/12-24') {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      } as const;
    }

    if (THREE_NOCTURN_CLASSES.has(params.celebration.rank.classSymbol)) {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      } as const;
    }

    return {
      nocturns: 1,
      totalLessons: 3,
      lessonsPerNocturn: [3]
    } as const;
  },
  selectBenedictions(params: {
    readonly nocturnIndex: 1 | 2 | 3;
    readonly lessons: readonly LessonPlan[];
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
    readonly totalLessons: MatinsPlan['totalLessons'];
  }): readonly BenedictioEntry[] {
    return selectRomanBenedictions({
      nocturnIndex: params.nocturnIndex,
      lessons: params.lessons,
      celebration: params.celebration,
      celebrationRules: params.celebrationRules,
      temporal: params.temporal,
      totalLessons: params.totalLessons
    });
  },
  resolveTeDeum(params) {
    if (params.celebrationRules.teDeumOverride === 'forced') {
      return 'say' as const;
    }
    if (params.celebrationRules.teDeumOverride === 'suppressed') {
      return 'omit' as const;
    }
    if (isTriduumDay(params.temporal)) {
      return 'omit' as const;
    }
    if (params.plan.totalLessons === 3 && isLikelyFerialMatins(params.temporal)) {
      return 'replace-with-responsory' as const;
    }
    return 'say' as const;
  },
  defaultScriptureCourse(temporal: TemporalContext): ScriptureCourse {
    return defaultRomanScriptureCourse(temporal);
  },
  octavesEnabled(feastRef: FeastReference): OctaveRule | null {
    if (rootFeastMatches(feastRef, PRIVILEGED_OCTAVES)) {
      return { level: 'privileged' };
    }
    if (rootFeastMatches(feastRef, COMMON_OCTAVES)) {
      return { level: 'common' };
    }
    return null;
  }
};

function toConcurrenceCommemoration(celebration: VespersSideView['celebration']): Commemoration {
  return {
    feastRef: celebration.feastRef,
    rank: celebration.rank,
    reason: celebration.kind === 'octave' ? 'octave-continuing' : 'concurrence',
    hours: ['vespers'],
    ...(celebration.kind ? { kind: celebration.kind } : {}),
    ...(celebration.octaveDay ? { octaveDay: celebration.octaveDay } : {})
  };
}

function toCandidate(celebration: VespersSideView['celebration']): Candidate {
  return {
    feastRef: celebration.feastRef,
    rank: celebration.rank,
    source: celebration.source,
    ...(celebration.kind ? { kind: celebration.kind } : {}),
    ...(celebration.octaveDay ? { octaveDay: celebration.octaveDay } : {})
  };
}

function isLikelyFerialMatins(temporal: TemporalContext): boolean {
  return (
    temporal.rank.classSymbol === 'feria' ||
    temporal.rank.classSymbol === 'privileged-feria-major'
  );
}

function compareOrdinarySundayAgainstMajorDouble(
  a: Candidate,
  b: Candidate
): number | null {
  const leftSunday = isOrdinarySundayCandidate(a);
  const rightSunday = isOrdinarySundayCandidate(b);
  const leftMajorDouble = isMajorDoubleThatImpedesOrdinarySunday(a);
  const rightMajorDouble = isMajorDoubleThatImpedesOrdinarySunday(b);

  if (leftSunday && rightMajorDouble) {
    return 1;
  }

  if (leftMajorDouble && rightSunday) {
    return -1;
  }

  return null;
}

function isOrdinarySundayCandidate(candidate: Candidate): boolean {
  return candidate.source === 'temporal' && candidate.rank.classSymbol === 'sunday';
}

function compareEmberFeriaAgainstVigil(a: Candidate, b: Candidate): number | null {
  const leftEmber = isEmberSaturdayCandidate(a);
  const rightEmber = isEmberSaturdayCandidate(b);
  const leftVigil = a.kind === 'vigil';
  const rightVigil = b.kind === 'vigil';

  if (leftEmber && rightVigil) {
    return -1;
  }

  if (leftVigil && rightEmber) {
    return 1;
  }

  return null;
}

function isEmberSaturdayCandidate(candidate: Candidate): boolean {
  return candidate.source === 'temporal' && candidate.feastRef.path === 'Tempora/Quad1-6';
}

function isMajorDoubleThatImpedesOrdinarySunday(candidate: Candidate): boolean {
  return (
    candidate.source !== 'temporal' &&
    candidate.kind !== 'octave' &&
    (candidate.rank.classSymbol === 'duplex-i' ||
      candidate.rank.classSymbol === 'duplex-ii')
  );
}

function isDoubleClass(classSymbol: string): boolean {
  return (
    classSymbol === 'duplex-i' ||
    classSymbol === 'duplex-ii' ||
    classSymbol === 'duplex-major' ||
    classSymbol === 'duplex'
  );
}

function isPaschalOrPentecostOctaveWeekday(feastPath: string): boolean {
  return /^Tempora\/Pasc[07]-[1-6]$/u.test(feastPath);
}

function isMajorFollowingDouble(celebration: VespersSideView['celebration']): boolean {
  if (isEpiphanyOctaveContinuation(celebration.feastRef.path)) {
    return false;
  }

  return (
    celebration.rank.classSymbol === 'duplex-i' ||
    celebration.rank.classSymbol === 'duplex-ii'
  );
}

function isEpiphanyOctaveContinuation(feastPath: string): boolean {
  return /^Sancti\/01-(0[8-9]|1[0-3])g$/u.test(feastPath);
}

function isChristmasOctaveSequencePath(feastPath: string): boolean {
  return (
    feastPath === 'Sancti/01-01' ||
    feastPath === 'Tempora/Nat2-0' ||
    /^Sancti\/12-(2[6-9]|3[0-1])$/u.test(feastPath)
  );
}

export function deriveVespersClassDivinoAfflatu(params: {
  readonly celebration: Celebration;
  readonly signals: FeastVespersSignals;
}): VespersClass {
  const { celebration, signals } = params;

  if (
    celebration.rank.classSymbol === 'privileged-sunday' ||
    celebration.rank.classSymbol === 'sunday' ||
    celebration.rank.classSymbol.startsWith('duplex') ||
    celebration.rank.classSymbol === 'semiduplex' ||
    celebration.rank.classSymbol === 'octave-major' ||
    celebration.rank.classSymbol === 'octave'
  ) {
    return 'totum';
  }

  if (signals.hasCapitulumOnly) {
    return 'capitulum';
  }

  if (signals.hasVespersSection || signals.hasVespersViaCommune) {
    return 'totum';
  }

  return 'nihil';
}
