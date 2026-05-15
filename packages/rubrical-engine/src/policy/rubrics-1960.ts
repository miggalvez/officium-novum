import { lookupVespers1960Row } from '../concurrence/tables/vespers-1960.js';
import { selectPsalmodyRoman1960 } from '../hours/psalter.js';
import { deriveSeasonalDirectives1960 } from '../hours/transforms.js';
import { thirdClassSanctoralWeekdayInPaschaltide1960 } from '../hours/paschaltide-sanctoral.js';
import {
  PRECEDENCE_1960_BY_CLASS,
  type ClassSymbol1960
} from '../occurrence/tables/precedence-1960.js';
import { buildCelebrationRuleSet as defaultBuildCelebrationRuleSet } from '../rules/evaluate.js';
import { mergeFeastRules } from '../rules/merge.js';
import { rubrics1960ResolveRank } from '../sanctoral/rank-normalizer.js';
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

const TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5', 'Quad6-6']);
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const PRIVILEGED_TEMPORAL_CLASSES = new Set<ClassSymbol1960>([
  'I-privilegiata-sundays',
  'I-privilegiata-ash-wednesday',
  'I-privilegiata-holy-week-feria',
  'I-privilegiata-christmas-vigil'
]);

const FEASTS_OF_THE_LORD = new Set<string>([
  'Sancti/01-00',
  'Sancti/01-01',
  'Sancti/01-06',
  'Sancti/01-13',
  'Sancti/02-02',
  'Sancti/07-01',
  'Sancti/08-06',
  'Sancti/09-14',
  'Sancti/10-DU',
  'Sancti/11-09',
  'Sancti/11-18',
  'Sancti/12-24',
  'Sancti/12-24s',
  'Sancti/12-24so',
  'Sancti/12-25',
  'Tempora/Epi1-0',
  'Tempora/Nat2-0',
  'Tempora/Nat2-0r',
  'Tempora/Pent02-5'
]);

const PASCHAL_ALLELUIA_PSALMODY_ANTIPHON_REF = {
  path: 'horas/Latin/Psalterium/Psalmi/Psalmi minor',
  section: 'Pasch',
  selector: '1'
} as const;

const HOLY_WEEK_KEYS = new Set([
  'Quad6-0',
  'Quad6-1',
  'Quad6-2',
  'Quad6-3',
  'Quad6-4',
  'Quad6-5',
  'Quad6-6'
]);

const CHRISTMAS_RELATED_TRANSFER_PATHS = new Set([
  'Sancti/12-25',
  'Tempora/Nat25',
  'Tempora/Nat26',
  'Tempora/Nat27',
  'Tempora/Nat28',
  'Tempora/Nat29',
  'Tempora/Nat30',
  'Tempora/Nat31',
  'Tempora/Nat01'
]);

const CHRISTMAS_OCTAVE_DAY_PATHS = new Set([
  'Tempora/Nat26',
  'Tempora/Nat27',
  'Tempora/Nat28',
  'Tempora/Nat29',
  'Tempora/Nat30',
  'Tempora/Nat31'
]);

export const rubrics1960Policy: RubricalPolicy = {
  name: 'rubrics-1960',
  resolveRank: rubrics1960ResolveRank,
  precedenceRow(classSymbol: string): PrecedenceRow {
    const row = PRECEDENCE_1960_BY_CLASS.get(classSymbol as ClassSymbol1960);
    if (!row) {
      throw new Error(`Unknown Rubrics 1960 class symbol: ${classSymbol}`);
    }
    return row;
  },
  applySeasonPreemption(candidates: readonly Candidate[], temporal: TemporalContext) {
    if (!isTriduum(temporal)) {
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
          'Sacred Triduum cannot be impeded; competing offices are omitted for the year.'
      });
    }

    return { kept, suppressed };
  },
  compareCandidates(a: Candidate, b: Candidate): number {
    return compareCandidates1960(a, b);
  },
  resolveConcurrence(params: {
    readonly today: VespersSideView;
    readonly tomorrow: VespersSideView;
    readonly temporal: TemporalContext;
  }): ConcurrenceResult {
    const row = lookupVespers1960Row(
      params.today.celebration.rank.classSymbol,
      params.tomorrow.celebration.rank.classSymbol
    );
    if (params.today.celebration.rank.classSymbol === params.tomorrow.celebration.rank.classSymbol) {
      return {
        winner: 'today',
        source: params.today.celebration,
        commemorations: [toConcurrenceCommemoration(params.tomorrow.celebration)],
        reason: 'equal-rank-praestantior',
        warnings: [
          {
            code: 'concurrence-praestantior-tie',
            message: 'Equal-rank concurrence resolved in favor of today (praestantior).',
            severity: 'info',
            context: {
              todayClass: params.today.celebration.rank.classSymbol,
              tomorrowClass: params.tomorrow.celebration.rank.classSymbol,
              citation: row.citation
            }
          }
        ]
      };
    }

    const compared = compareCandidates1960(
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
          message: 'Concurrence compare fell through to praestantior tie resolution.',
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
    if (TRIDUUM_KEYS.has(params.today.temporal.dayName)) {
      return {
        kind: 'triduum-special',
        dayName: params.today.temporal.dayName
      };
    }

    if (
      params.concurrence.winner === 'today' &&
      params.concurrence.source.source === 'temporal' &&
      isFerialClass(params.today.celebration.rank.classSymbol) &&
      params.today.celebration.feastRef.path === params.concurrence.source.feastRef.path
    ) {
      return {
        kind: 'ordinary'
      };
    }

    if (
      params.concurrence.winner === 'today' &&
      params.today.celebration.source === 'sanctoral' &&
      params.today.celebration.rank.classSymbol === 'III' &&
      params.today.temporal.dayOfWeek !== 0
    ) {
      return {
        kind: 'ordinary'
      };
    }

    return {
      kind: 'vespers-winner',
      celebration: params.concurrence.source
    };
  },
  isPrivilegedFeria(temporal: TemporalContext): boolean {
    return (
      temporal.dayName === 'Quadp3-3' ||
      HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName) ||
      temporal.date.endsWith('-12-24')
    );
  },
  buildCelebrationRuleSet(feastFile, commemorations, context) {
    const base = defaultBuildCelebrationRuleSet(feastFile, commemorations, context);
    let celebrationRules = base.celebrationRules;

    if (isPostEpiphanyFeriaWithEpiphanyVide1960(context)) {
      celebrationRules = mergeFeastRules(celebrationRules, {
        festumDomini: false,
        antiphonScheme: 'default',
        hourScopedDirectives: celebrationRules.hourScopedDirectives.filter(
          (entry) => !isEpiphanyFeastOnlyVideDirective1960(entry.directive.raw)
        )
      });
    }

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

    celebrationRules = mergeFeastRules(
      celebrationRules,
      officeBoundaryPatch1960(context.celebration, context.dayOfWeek, celebrationRules)
    );

    return {
      celebrationRules,
      warnings: base.warnings
    };
  },
  transferTarget(
    candidate,
    fromDate,
    until,
    dayContext,
    overlayFor,
    occupantOn
  ) {
    return walkTransferTargetDate({
      impeded: candidate,
      fromDate,
      until,
      dayContext,
      overlayFor,
      occupantOn,
      compareCandidates: rubrics1960Policy.compareCandidates,
      forbidsTransferInto: forbidsTransferInto1960
    });
  },
  selectPsalmody(params: SelectPsalmodyParams): readonly PsalmAssignment[] {
    const psalmody = selectPsalmodyRoman1960({
      policyName: 'rubrics-1960',
      hour: params.hour,
      celebration: params.celebration,
      celebrationRules: params.celebrationRules,
      hourRules: paschaltidePsalmody1960(params),
      temporal: params.temporal,
      corpus: params.corpus,
      vespersSide: params.vespersSide,
      omitPrimeBracketPsalm: true
    });

    return temporalSundayPaschaltideMinorPsalmody1960(params, psalmody);
  },
  hourDirectives(params: HourDirectivesParams): ReadonlySet<HourDirective> {
    return deriveSeasonalDirectives1960({
      hour: params.hour,
      celebration: params.celebration,
      celebrationRules: params.celebrationRules,
      hourRules: params.hourRules,
      temporal: params.temporal,
      ...(params.overlay ? { overlay: params.overlay } : {})
    });
  },
  limitCommemorations(
    commemorations: readonly Commemoration[],
    params
  ): readonly Commemoration[] {
    let admissible = commemorations.filter((entry) =>
      isAdmissibleCommemoration1960(entry)
    );

    if (
      HOLY_WEEK_MON_WED_KEYS.has(params.temporal.dayName) ||
      isPaschalOctaveDay(params.temporal)
    ) {
      return [];
    }

    if (isFirstClassVigil1960(params.celebration)) {
      return [];
    }

    if (isFeastOfTheLordReplacingSecondClassSunday(params.celebration, params.temporal)) {
      admissible = admissible.filter((entry) => !isSundayCommemoration(entry));
    }

    if (isFirstClassDay1960(params.celebration, params.temporal)) {
      return admissible.filter((entry) => isPrivilegedCommemoration1960(entry)).slice(0, 1);
    }

    if (isSecondClassSundayOffice(params.celebration, params.temporal, params.celebrationRules)) {
      return admissible.filter((entry) => entry.rank.classSymbol === 'II').slice(0, 1);
    }

    if (
      params.celebration.rank.classSymbol === 'II' ||
      params.celebration.rank.classSymbol === 'II-ember-day'
    ) {
      const privileged = admissible.filter((entry) => isPrivilegedCommemoration1960(entry));
      return (privileged.length > 0 ? privileged : admissible).slice(0, 1);
    }

    return admissible.slice(0, 2);
  },
  // Phase 3 §3e: under Rubricarum Instructum §106–109 commemorations are
  // said only at Lauds and Vespers. Matins / minor hours / Compline emit
  // no commemoration slots. This hook gates that decision uniformly.
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
  resolveMatinsShape(params): {
    readonly nocturns: 1 | 3;
    readonly totalLessons: 3 | 9 | 12;
    readonly lessonsPerNocturn: readonly number[];
  } {
    const configured =
      params.celebrationRules.matins.lessonCount === 12
        ? 9
        : params.celebrationRules.matins.lessonCount;

    if (
      params.celebrationRules.matins.nocturns === 1 ||
      configured === 3 ||
      isPaschalOctaveDay(params.temporal)
    ) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    if (isTriduum(params.temporal)) {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      };
    }

    if (params.celebration.feastRef.path === 'Tempora/Nat25') {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      };
    }

    if (isChristmasOctaveDayCelebration(params.celebration)) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    // I classis Sundays (e.g. Trinity Sunday `Pent01-0`, Easter Octave Sundays)
    // keep the 9-lesson three-nocturn shape under 1960 even though the
    // generic Sunday office is reduced to 1 nocturn. Codex Rubricarum §164
    // sets the per-class lesson counts; the 1-nocturn Sunday simplification
    // applies to II / III / IV classis Sundays only.
    if (
      isSundayOffice1960(params.celebration, params.temporal, params.celebrationRules) &&
      params.celebration.rank.classSymbol !== 'I'
    ) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    if (
      params.celebration.feastRef.path === 'Commune/C10' ||
      params.celebration.rank.classSymbol === 'III' ||
      isFerialClass(params.celebration.rank.classSymbol) ||
      params.celebration.kind === 'vigil' ||
      isThreeLessonPrivilegedTemporal(params.temporal)
    ) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    if (params.celebration.rank.classSymbol === 'I' || params.celebration.rank.classSymbol === 'II') {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      };
    }

    return {
      nocturns: 3,
      totalLessons: 9,
      lessonsPerNocturn: [3, 3, 3]
    };
  },
  selectBenedictions(params: {
    readonly nocturnIndex: 1 | 2 | 3;
    readonly lessons: readonly LessonPlan[];
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
    readonly totalLessons: MatinsPlan['totalLessons'];
  }): readonly BenedictioEntry[] {
    if (
      params.totalLessons === 3 &&
      params.celebration.source === 'temporal' &&
      params.temporal.dayOfWeek === 0 &&
      /^Pasc[1-5]-0$/u.test(params.temporal.dayName)
    ) {
      return selectRomanBenedictions({
        nocturnIndex: params.nocturnIndex,
        lessons: params.lessons,
        celebration: params.celebration,
        temporal: params.temporal,
        totalLessons: params.totalLessons
      }).map((entry) =>
        entry.index === 3
          ? {
              index: entry.index,
              reference: {
                path: 'horas/Latin/Psalterium/Benedictions.txt',
                section: 'Evangelica9'
              }
            }
          : entry
      );
    }

    return selectRomanBenedictions({
      nocturnIndex: params.nocturnIndex,
      lessons: params.lessons,
      celebration: params.celebration,
      temporal: params.temporal,
      totalLessons: params.totalLessons
    });
  },
  resolveTeDeum(params: {
    readonly plan: Pick<MatinsPlan, 'nocturns' | 'totalLessons'>;
    readonly celebration: Celebration;
    readonly celebrationRules: CelebrationRuleSet;
    readonly temporal: TemporalContext;
  }): 'say' | 'replace-with-responsory' | 'omit' {
    if (params.celebrationRules.teDeumOverride === 'forced') {
      return 'say';
    }
    if (params.celebrationRules.teDeumOverride === 'suppressed') {
      return 'omit';
    }

    // RI §196: Te Deum is omitted in the Sacred Triduum.
    if (TRIDUUM_KEYS.has(params.temporal.dayName)) {
      return 'omit';
    }

    if (params.plan.totalLessons === 3) {
      return requiresTeDeumInThreeLessonOffice1960(params)
        ? 'say'
        : 'replace-with-responsory';
    }

    return 'say';
  },
  defaultScriptureCourse(temporal: TemporalContext): ScriptureCourse {
    // RI §§218-220: seasonal scripture course selection for Matins.
    switch (temporal.season) {
      case 'advent':
        return 'advent-isaias';
      case 'christmastide':
        return isWithinChristmasOctave(temporal.date)
          ? 'octava-nativitatis'
          : 'tempora-nativitatis';
      case 'epiphanytide':
      case 'time-after-epiphany':
        return 'post-epiphania';
      case 'septuagesima':
        return 'septuagesima';
      case 'lent':
        return 'lent';
      case 'passiontide':
        return 'passiontide';
      case 'eastertide':
      case 'pentecost-octave':
        return 'paschaltide';
      case 'ascensiontide':
        return 'ascensiontide';
      case 'time-after-pentecost':
      default:
        return 'post-pentecost';
    }
  },
  octavesEnabled(_feastRef: FeastReference): OctaveRule | null {
    return null;
  }
};

function paschaltidePsalmody1960(
  params: SelectPsalmodyParams
): SelectPsalmodyParams['hourRules'] {
  if (usesTemporalSundayPaschalAlleluiaPsalmodyAntiphon(params)) {
    return {
      ...params.hourRules,
      psalmodyAntiphonOverride: {
        source: 'paschal-alleluia',
        application: 'whole-slot',
        ref: PASCHAL_ALLELUIA_PSALMODY_ANTIPHON_REF
      }
    };
  }

  if (
    params.celebration.source !== 'sanctoral' ||
    params.celebration.rank.classSymbol !== 'III' ||
    params.temporal.dayOfWeek === 0
  ) {
    return params.hourRules;
  }

  const hourRules: SelectPsalmodyParams['hourRules'] =
    usesThirdClassSanctoralWeekdayFerialPsalmody(params.hour)
      ? {
          ...params.hourRules,
          psalterScheme: 'ferial',
          psalmOverrides: []
        }
      : params.hourRules;

  if (
    !thirdClassSanctoralWeekdayInPaschaltide1960(params) ||
    !usesThirdClassSanctoralPaschalAlleluiaPsalmodyAntiphon(params.hour)
  ) {
    return hourRules;
  }

  return {
    ...hourRules,
    psalmodyAntiphonOverride: {
      source: 'paschal-alleluia',
      application: 'whole-slot',
      ref: PASCHAL_ALLELUIA_PSALMODY_ANTIPHON_REF
    }
  };
}

function usesTemporalSundayPaschalAlleluiaPsalmodyAntiphon(
  params: SelectPsalmodyParams
): boolean {
  return (
    params.celebration.source === 'temporal' &&
    params.temporal.dayOfWeek === 0 &&
    /^Pasc[1-5]-0$/u.test(params.temporal.dayName) &&
    (params.hour === 'lauds' || params.hour === 'vespers')
  );
}

function temporalSundayPaschaltideMinorPsalmody1960(
  params: SelectPsalmodyParams,
  psalmody: readonly PsalmAssignment[]
): readonly PsalmAssignment[] {
  if (
    params.celebration.source !== 'temporal' ||
    params.temporal.dayOfWeek !== 0 ||
    !/^Pasc[1-5]-0$/u.test(params.temporal.dayName) ||
    !usesThirdClassSanctoralPaschalAlleluiaPsalmodyAntiphon(params.hour)
  ) {
    return psalmody;
  }

  const filtered =
    params.hour === 'prime'
      ? psalmody.filter((assignment) => assignment.psalmRef.selector !== '53')
      : psalmody;

  return Object.freeze(
    filtered.map((assignment) => ({
      ...assignment,
      antiphonRef: PASCHAL_ALLELUIA_PSALMODY_ANTIPHON_REF
    }))
  );
}

function requiresTeDeumInThreeLessonOffice1960(params: {
  readonly celebration: Celebration;
  readonly temporal: TemporalContext;
}): boolean {
  if (
    params.celebration.source === 'sanctoral' &&
    params.celebration.kind !== 'vigil'
  ) {
    return true;
  }

  return (
    isPaschalOctaveDay(params.temporal) ||
    params.temporal.season === 'eastertide' ||
    params.temporal.season === 'ascensiontide' ||
    params.temporal.season === 'pentecost-octave' ||
    /^Nat/iu.test(params.temporal.dayName)
  );
}

function usesThirdClassSanctoralPaschalAlleluiaPsalmodyAntiphon(
  hour: HourName
): boolean {
  return (
    hour === 'lauds' ||
    hour === 'prime' ||
    hour === 'terce' ||
    hour === 'sext' ||
    hour === 'none' ||
    hour === 'vespers'
  );
}

function usesThirdClassSanctoralWeekdayFerialPsalmody(hour: HourName): boolean {
  return usesThirdClassSanctoralPaschalAlleluiaPsalmodyAntiphon(hour);
}

function isPostEpiphanyFeriaWithEpiphanyVide1960(context: {
  readonly dayName: string;
  readonly celebration: Celebration;
}): boolean {
  return (
    /^Nat(?:0[7-9]|1[0-2])$/u.test(context.dayName) &&
    context.celebration.source === 'temporal' &&
    context.celebration.feastRef.path === `Tempora/${context.dayName}`
  );
}

function isEpiphanyFeastOnlyVideDirective1960(raw: string): boolean {
  const normalized = raw.trim().replace(/\s+/gu, ' ');
  return (
    normalized === 'Psalmi Dominica' ||
    normalized === 'Antiphonas horas' ||
    normalized === 'Omit ad Matutinum Incipit Invitatorium Hymnus' ||
    /^Psalm5 Vespera(?:3)?=/u.test(normalized)
  );
}

function compareCandidates1960(a: Candidate, b: Candidate): number {
  const privilegedOverride = comparePrivilegedTemporal(a, b);
  if (privilegedOverride !== null) {
    return privilegedOverride;
  }

  const secondClassSundayOverride = compareFeastOfTheLordWithSecondClassSunday(a, b);
  if (secondClassSundayOverride !== null) {
    return secondClassSundayOverride;
  }

  const christmasOctaveOverride = compareChristmasOctaveDays(a, b);
  if (christmasOctaveOverride !== null) {
    return christmasOctaveOverride;
  }

  if (a.rank.weight !== b.rank.weight) {
    return b.rank.weight - a.rank.weight;
  }

  const sourceOrder = sourceTieBreakOrder(a.source) - sourceTieBreakOrder(b.source);
  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  return a.feastRef.path.localeCompare(b.feastRef.path);
}

function comparePrivilegedTemporal(a: Candidate, b: Candidate): number | null {
  const temporal = a.source === 'temporal' ? a : b.source === 'temporal' ? b : null;
  if (!temporal) {
    return null;
  }

  const sanctoral = temporal === a ? b : a;
  if (sanctoral.source === 'temporal') {
    return null;
  }

  if (temporal.rank.classSymbol === 'I-privilegiata-triduum') {
    return temporal === a ? -1 : 1;
  }

  if (
    temporal.rank.classSymbol === 'IV-lenten-feria' &&
    sanctoral.rank.classSymbol === 'III'
  ) {
    return temporal === a ? -1 : 1;
  }

  if (!PRIVILEGED_TEMPORAL_CLASSES.has(temporal.rank.classSymbol as ClassSymbol1960)) {
    return null;
  }

  // horascommon.pl:397-405 models the 1960 "Festum Domini" displacement on privileged Sundays
  // and includes the Immaculate Conception exception against Advent II.
  if (canDisplacePrivilegedTemporal(sanctoral)) {
    return temporal === a ? 1 : -1;
  }

  return temporal === a ? -1 : 1;
}

function canDisplacePrivilegedTemporal(candidate: Candidate): boolean {
  if (candidate.feastRef.path === 'Sancti/12-08') {
    return true;
  }

  return candidate.rank.classSymbol === 'I' && FEASTS_OF_THE_LORD.has(candidate.feastRef.path);
}

function compareFeastOfTheLordWithSecondClassSunday(a: Candidate, b: Candidate): number | null {
  const sunday = isSecondClassSundayCandidate(a) ? a : isSecondClassSundayCandidate(b) ? b : null;
  if (!sunday) {
    return null;
  }

  const other = sunday === a ? b : a;
  if (!isFirstOrSecondClassFeastOfTheLord(other)) {
    return null;
  }

  return sunday === a ? 1 : -1;
}

function isSecondClassSundayCandidate(candidate: Candidate): boolean {
  return (
    candidate.source === 'temporal' &&
    candidate.rank.classSymbol === 'II' &&
    isTemporalSundayPath(candidate.feastRef.path)
  );
}

function isFirstOrSecondClassFeastOfTheLord(candidate: Candidate | Celebration): boolean {
  return (
    (candidate.rank.classSymbol === 'I' || candidate.rank.classSymbol === 'II') &&
    FEASTS_OF_THE_LORD.has(candidate.feastRef.path)
  );
}

function isTriduum(temporal: TemporalContext): boolean {
  return TRIDUUM_KEYS.has(temporal.dayName);
}

function sourceTieBreakOrder(source: Candidate['source']): number {
  switch (source) {
    case 'temporal':
      return 0;
    case 'sanctoral':
    case 'transferred-in':
      return 1;
    default:
      return 2;
  }
}

function toConcurrenceCommemoration(celebration: VespersSideView['celebration']): Commemoration {
  return {
    feastRef: celebration.feastRef,
    rank: celebration.rank,
    reason: 'concurrence',
    hours: ['vespers']
  };
}

function toCandidate(celebration: VespersSideView['celebration']): Candidate {
  return {
    feastRef: celebration.feastRef,
    rank: celebration.rank,
    source: celebration.source
  };
}

function isFerialClass(classSymbol: string): boolean {
  return (
    classSymbol === 'IV' ||
    classSymbol === 'IV-lenten-feria' ||
    classSymbol === 'II-ember-day'
  );
}

function isThreeLessonPrivilegedTemporal(temporal: TemporalContext): boolean {
  return temporal.dayName === 'Quadp3-3' || HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName);
}

function isPaschalOctaveDay(temporal: TemporalContext): boolean {
  return /^Pasc0-[0-6]$/u.test(temporal.dayName) || temporal.dayName === 'Pasc1-0';
}

function forbidsTransferInto1960(impeded: Candidate, temporal: TemporalContext): boolean {
  // RI §95: no transfers are admitted into Palm Sunday or the feriae of Holy Week.
  if (HOLY_WEEK_KEYS.has(temporal.dayName)) {
    return true;
  }

  // RI §94 (with §95): the Sacred Triduum is absolutely privileged.
  if (TRIDUUM_KEYS.has(temporal.dayName)) {
    return true;
  }

  // RI §95: Ash Wednesday is privileged and does not receive transferred feasts.
  if (temporal.dayName === 'Quadp3-3') {
    return true;
  }

  // RI §95: the Vigil of Christmas (Dec 24) remains a privileged feria.
  if (temporal.date.endsWith('-12-24')) {
    return true;
  }

  // RI §§93, 95: the Christmas octave is restricted; non-Christmas transfers do not land here.
  if (isWithinChristmasOctave(temporal.date) && !isChristmasRelatedTransfer(impeded)) {
    return true;
  }

  return false;
}

function isWithinChristmasOctave(isoDate: string): boolean {
  const monthDay = isoDate.slice(5);
  return (
    monthDay === '12-25' ||
    monthDay === '12-26' ||
    monthDay === '12-27' ||
    monthDay === '12-28' ||
    monthDay === '12-29' ||
    monthDay === '12-30' ||
    monthDay === '12-31' ||
    monthDay === '01-01'
  );
}

function isChristmasRelatedTransfer(candidate: Candidate): boolean {
  return CHRISTMAS_RELATED_TRANSFER_PATHS.has(candidate.feastRef.path);
}

function compareChristmasOctaveDays(a: Candidate, b: Candidate): number | null {
  const leftIsChristmasOctaveDay = isChristmasOctaveDayCandidate(a);
  const rightIsChristmasOctaveDay = isChristmasOctaveDayCandidate(b);
  if (leftIsChristmasOctaveDay === rightIsChristmasOctaveDay) {
    return null;
  }

  const other = leftIsChristmasOctaveDay ? b : a;
  if (other.rank.classSymbol !== 'II') {
    return null;
  }

  return leftIsChristmasOctaveDay ? 1 : -1;
}

function isChristmasOctaveDayCandidate(candidate: Candidate): boolean {
  return CHRISTMAS_OCTAVE_DAY_PATHS.has(candidate.feastRef.path);
}

function officeBoundaryPatch1960(
  celebration: Celebration,
  dayOfWeek: number,
  celebrationRules: CelebrationRuleSet
): {
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;
} {
  const computed = computeOfficeBoundaries1960(celebration, dayOfWeek, celebrationRules);
  return {
    hasFirstVespers: celebrationRules.hasFirstVespers && computed.hasFirstVespers,
    hasSecondVespers: celebrationRules.hasSecondVespers && computed.hasSecondVespers
  };
}

function computeOfficeBoundaries1960(
  celebration: Celebration,
  dayOfWeek: number,
  celebrationRules: CelebrationRuleSet
): {
  readonly hasFirstVespers: boolean;
  readonly hasSecondVespers: boolean;
} {
  if (celebration.feastRef.path === 'Commune/C10') {
    return {
      hasFirstVespers: false,
      hasSecondVespers: false
    };
  }

  if (celebration.kind === 'vigil') {
    return {
      hasFirstVespers: false,
      hasSecondVespers: !isFirstClassVigil1960(celebration)
    };
  }

  if (isSundayOffice1960(celebration, { dayOfWeek }, celebrationRules)) {
    return {
      hasFirstVespers: true,
      hasSecondVespers: true
    };
  }

  if (celebration.rank.classSymbol === 'I') {
    return {
      hasFirstVespers: true,
      hasSecondVespers: true
    };
  }

  if (celebration.rank.classSymbol === 'II') {
    return {
      hasFirstVespers:
        (celebrationRules.festumDomini || FEASTS_OF_THE_LORD.has(celebration.feastRef.path)) &&
        dayOfWeek === 0,
      hasSecondVespers: true
    };
  }

  if (celebration.rank.classSymbol === 'III') {
    return {
      hasFirstVespers: false,
      hasSecondVespers: true
    };
  }

  return {
    hasFirstVespers: false,
    hasSecondVespers: celebration.source !== 'temporal' || dayOfWeek !== 6
  };
}

function isSundayOffice1960(
  celebration: Celebration,
  temporal: Pick<TemporalContext, 'dayOfWeek'>,
  celebrationRules: CelebrationRuleSet
): boolean {
  return (
    temporal.dayOfWeek === 0 &&
    celebration.source === 'temporal' &&
    !celebrationRules.festumDomini
  );
}

function isFirstClassDay1960(
  celebration: Celebration,
  temporal: TemporalContext
): boolean {
  return (
    celebration.rank.classSymbol === 'I' ||
    celebration.rank.classSymbol.startsWith('I-privilegiata-') ||
    (celebration.kind === 'vigil' && temporal.date.endsWith('-12-24'))
  );
}

function isSecondClassSundayOffice(
  celebration: Celebration,
  temporal: TemporalContext,
  celebrationRules: CelebrationRuleSet
): boolean {
  return (
    celebration.rank.classSymbol === 'II' &&
    isSundayOffice1960(celebration, temporal, celebrationRules)
  );
}

function isFeastOfTheLordReplacingSecondClassSunday(
  celebration: Celebration,
  temporal: TemporalContext
): boolean {
  return (
    temporal.dayOfWeek === 0 &&
    temporal.rank.classSymbol === 'II' &&
    isFirstOrSecondClassFeastOfTheLord(celebration)
  );
}

function isFirstClassVigil1960(celebration: Celebration): boolean {
  return (
    celebration.kind === 'vigil' &&
    (celebration.rank.classSymbol === 'I' ||
      celebration.rank.classSymbol === 'I-privilegiata-christmas-vigil')
  );
}

function isPrivilegedCommemoration1960(entry: Commemoration): boolean {
  if (entry.reason === 'sunday') {
    return true;
  }

  if (entry.rank.classSymbol === 'I' || entry.rank.classSymbol.startsWith('I-privilegiata-')) {
    return true;
  }

  const path = entry.feastRef.path;
  if (/^Tempora\/Nat(?:26|27|28|29|30|31|01)$/u.test(path)) {
    return true;
  }

  if (/^Tempora\/Pent17-[356]$/u.test(path)) {
    return true;
  }

  if (/^Tempora\/Adv\d+-[1-6]$/u.test(path) || /^Tempora\/Quad/.test(path)) {
    return true;
  }

  return false;
}

function isSundayCommemoration(entry: Commemoration): boolean {
  return entry.reason === 'sunday' || isTemporalSundayPath(entry.feastRef.path);
}

function isAdmissibleCommemoration1960(entry: Commemoration): boolean {
  if (entry.feastRef.path === 'Commune/C10') {
    return false;
  }

  if (entry.rank.classSymbol === 'IV' && entry.feastRef.path.startsWith('Tempora/')) {
    // General Rubrics (1960) §112: ferias of the fourth class are never commemorated.
    return false;
  }

  return true;
}

function isChristmasOctaveDayCelebration(celebration: Celebration): boolean {
  return isChristmasOctaveDayCandidate({
    feastRef: celebration.feastRef,
    rank: celebration.rank,
    source: celebration.source
  });
}

/**
 * Internal helper consumed by concurrence/vespers-class.ts for policy-specific
 * 1960 Vespers class derivation.
 */
export function deriveVespersClass1960(params: {
  readonly celebration: VespersSideView['celebration'];
  readonly signals: FeastVespersSignals;
}): VespersClass {
  const { celebration, signals } = params;
  const classSymbol = celebration.rank.classSymbol;

  if (classSymbol === 'I' || classSymbol.startsWith('I-privilegiata-')) {
    return 'totum';
  }

  if (isTemporalSundayPath(celebration.feastRef.path)) {
    return 'totum';
  }

  const hasProperVespers =
    (signals.hasVespersSection || signals.hasVespersViaCommune) &&
    !signals.hasCapitulumOnly;

  if (classSymbol === 'II') {
    return hasProperVespers ? 'totum' : 'capitulum';
  }

  if (classSymbol === 'III') {
    return hasProperVespers || signals.hasCapitulumOnly ? 'capitulum' : 'nihil';
  }

  if (classSymbol === 'II-ember-day') {
    return 'nihil';
  }

  if (classSymbol === 'IV' || classSymbol === 'IV-lenten-feria' || classSymbol === 'commemoration-only') {
    return 'nihil';
  }

  return hasProperVespers ? 'capitulum' : 'nihil';
}

function isTemporalSundayPath(feastPath: string): boolean {
  if (!feastPath.startsWith('Tempora/')) {
    return false;
  }
  return /-\d+$/u.test(feastPath) && feastPath.endsWith('-0');
}
