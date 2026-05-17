import { lookupVespers1955Row } from '../concurrence/tables/vespers-1955.js';
import { selectPsalmodyRoman1960 } from '../hours/psalter.js';
import {
  PRECEDENCE_1955_BY_CLASS,
  type ClassSymbol1955
} from '../occurrence/tables/precedence-1955.js';
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
import { reduced1955ResolveRank } from '../sanctoral/rank-normalizer.js';
import { walkTransferTargetDate } from '../transfer/compute.js';
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
import type { FeastVespersSignals } from '../concurrence/vespers-class.js';

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
const NO_COMMEMORATION_FEASTS = new Set<string>([
  'Sancti/01-01',
  'Sancti/01-06',
  'Sancti/12-24',
  'Sancti/12-25',
  'Tempora/Pasc5-4',
  'Tempora/Pasc7-0',
  'Tempora/Pent01-0',
  'Tempora/Pent01-0r',
  'Tempora/Pent01-4'
]);

export const reduced1955Policy: RubricalPolicy = {
  name: 'reduced-1955',
  resolveRank: reduced1955ResolveRank,
  precedenceRow(classSymbol: string): PrecedenceRow {
    const row = PRECEDENCE_1955_BY_CLASS.get(classSymbol as ClassSymbol1955);
    if (!row) {
      throw new Error(`Unknown Reduced 1955 class symbol: ${classSymbol}`);
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
        reason: 'Sacred Triduum days suppress sanctoral offices under the 1955 simplification.'
      });
    }

    return { kept, suppressed };
  },
  compareCandidates(a: Candidate, b: Candidate): number {
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
      (params.today.celebration.rank.classSymbol === 'sunday' ||
        params.today.celebration.rank.classSymbol === 'semiduplex') &&
      isMajorFollowingDouble1955(params.tomorrow.celebration)
    ) {
      return {
        winner: 'tomorrow',
        source: params.tomorrow.celebration,
        commemorations: [toConcurrenceCommemoration(params.today.celebration)],
        reason: 'tomorrow-higher-rank',
        warnings: []
      };
    }

    const row = lookupVespers1955Row(
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

    const compared = reduced1955Policy.compareCandidates(
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
          message: 'Equal-rank 1955 concurrence resolved in favor of today.',
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

    // Holy Thursday and Good Friday do not compete by ordinary first/second
    // Vespers in the 1955 Holy Week simplification.
    if (context.dayName === 'Quad6-4' || context.dayName === 'Quad6-5') {
      celebrationRules = mergeFeastRules(celebrationRules, {
        hasFirstVespers: false,
        hasSecondVespers: false
      });
    }

    celebrationRules = mergeFeastRules(
      celebrationRules,
      officeBoundaryPatch1955(context.celebration, celebrationRules)
    );

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
      compareCandidates: reduced1955Policy.compareCandidates,
      forbidsTransferInto(impeded, temporal) {
        return forbidsTransferIntoRoman(impeded, temporal, {
          suppressChristmasOctave: true
        });
      }
    });
  },
  selectPsalmody(params: SelectPsalmodyParams): readonly PsalmAssignment[] {
    return selectPsalmodyRoman1960({
      policyName: 'reduced-1955',
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
    if (
      NO_COMMEMORATION_FEASTS.has(params.celebration.feastRef.path) ||
      isPaschalOctaveDay(params.temporal) ||
      isPentecostOctaveDay(params.temporal) ||
      params.temporal.dayName === 'Quadp3-3' ||
      HOLY_WEEK_MON_WED_KEYS.has(params.temporal.dayName) ||
      (params.temporal.dayOfWeek === 0 &&
        (params.temporal.season === 'lent' || params.temporal.season === 'passiontide'))
    ) {
      return [];
    }

    const laudsVespersLimit =
      params.temporal.dayOfWeek === 0 ||
      params.celebration.rank.classSymbol === 'duplex-i' ||
      params.celebration.rank.classSymbol === 'duplex-ii' ||
      params.celebration.rank.classSymbol === 'privileged-sunday' ||
      params.celebration.rank.classSymbol === 'privileged-feria-major'
        ? 2
        : commemorations.length;
    const scoped =
      laudsVespersLimit < commemorations.length
        ? collapseSameDayCommemorations(commemorations)
        : commemorations;
    if (scoped.length === 0) {
      return scoped;
    }

    const matinsLimit = 0;
    return limitCommemorationsByHour(scoped, laudsVespersLimit, matinsLimit);
  },
  // Phase 3 §3e: Cum Nostra (1955) set `matinsLimit = 0` in
  // `limitCommemorations` above, effectively abolishing Matins
  // commemorations ahead of the 1960 simplification. The hooks mirror that
  // by declaring only Lauds / Vespers here — structurally identical to the
  // 1960 behaviour. If 3h adjudication surfaces a specific Matins
  // commemoration the 1955 rubrics still retained, widen here.
  defaultCommemorationHours(): readonly HourName[] {
    return ['lauds', 'vespers'];
  },
  commemoratesAtHour(params: {
    readonly hour: HourName;
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
  }): boolean {
    return params.hour === 'lauds' || params.hour === 'vespers';
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

function officeBoundaryPatch1955(
  celebration: Celebration,
  celebrationRules: {
    readonly hasFirstVespers: boolean;
    readonly hasSecondVespers: boolean;
  }
): {
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;
} {
  const hasFirstVespers =
    celebration.rank.classSymbol === 'duplex-i' ||
    celebration.rank.classSymbol === 'duplex-ii' ||
    celebration.rank.classSymbol === 'privileged-sunday' ||
    celebration.rank.classSymbol === 'sunday' ||
    ((celebration.rank.classSymbol === 'duplex' ||
      celebration.rank.classSymbol === 'duplex-major') &&
      isMarianOrLordDouble1955(celebration));

  return {
    hasFirstVespers:
      celebrationRules.hasFirstVespers &&
      hasFirstVespers &&
      !isPaschalOrPentecostOctaveWeekday1955(celebration.feastRef.path),
    hasSecondVespers:
      celebrationRules.hasSecondVespers &&
      celebration.rank.classSymbol !== 'commemoration-only'
  };
}

export function deriveVespersClass1955(params: {
  readonly celebration: Celebration;
  readonly signals: FeastVespersSignals;
}): VespersClass {
  const { celebration, signals } = params;

  if (
    celebration.rank.classSymbol === 'privileged-sunday' ||
    celebration.rank.classSymbol === 'sunday' ||
    celebration.rank.classSymbol === 'duplex-i' ||
    celebration.rank.classSymbol === 'duplex-ii' ||
    celebration.rank.classSymbol === 'duplex-major' ||
    celebration.rank.classSymbol === 'duplex' ||
    celebration.rank.classSymbol === 'semiduplex' ||
    celebration.rank.classSymbol === 'octave-major' ||
    celebration.rank.classSymbol === 'octave' ||
    celebration.rank.classSymbol === 'vigil-major'
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

function isMarianOrLordDouble1955(celebration: Celebration): boolean {
  return (
    /\bmari/iu.test(celebration.feastRef.title) ||
    /\bdomini\b/iu.test(celebration.feastRef.title)
  );
}

function isPaschalOrPentecostOctaveWeekday1955(feastPath: string): boolean {
  return /^Tempora\/Pasc[07]-[1-6]r?$/u.test(feastPath);
}

function isMajorFollowingDouble1955(celebration: VespersSideView['celebration']): boolean {
  return (
    celebration.rank.classSymbol === 'duplex-i' ||
    celebration.rank.classSymbol === 'duplex-ii' ||
    ((celebration.rank.classSymbol === 'duplex' ||
      celebration.rank.classSymbol === 'duplex-major') &&
      isMarianOrLordDouble1955(celebration))
  );
}
