import { lookupVespers1960Row } from '../concurrence/tables/vespers-1960.js';
import { selectPsalmodyRoman1960 } from '../hours/psalter.js';
import { deriveSeasonalDirectives1960 } from '../hours/transforms.js';
import {
  PRECEDENCE_1960_BY_CLASS,
  type ClassSymbol1960
} from '../occurrence/tables/precedence-1960.js';
import { buildCelebrationRuleSet as defaultBuildCelebrationRuleSet } from '../rules/evaluate.js';
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
import type { MatinsPlan, ScriptureCourse } from '../types/matins.js';
import type {
  Candidate,
  FeastReference,
  TemporalContext
} from '../types/model.js';
import type { Celebration, Commemoration } from '../types/ordo.js';
import type {
  HourDirectivesParams,
  PrecedenceRow,
  RubricalPolicy,
  SelectPsalmodyParams
} from '../types/policy.js';
import type { CelebrationRuleSet } from '../types/rule-set.js';
import { UnsupportedPolicyError } from '../types/policy.js';

const TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5', 'Quad6-6']);
const HOLY_WEEK_MON_WED_KEYS = new Set(['Quad6-1', 'Quad6-2', 'Quad6-3']);
const PRIVILEGED_TEMPORAL_CLASSES = new Set<ClassSymbol1960>([
  'I-privilegiata-sundays',
  'I-privilegiata-ash-wednesday',
  'I-privilegiata-holy-week-feria',
  'I-privilegiata-christmas-vigil',
  'I-privilegiata-rogation-monday'
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

    return {
      kind: 'vespers-winner',
      celebration: params.concurrence.source
    };
  },
  isPrivilegedFeria(temporal: TemporalContext): boolean {
    return (
      temporal.dayName === 'Quadp3-3' ||
      HOLY_WEEK_MON_WED_KEYS.has(temporal.dayName) ||
      temporal.dayName === 'Pasc5-1' ||
      temporal.date.endsWith('-12-24')
    );
  },
  buildCelebrationRuleSet(feastFile, commemorations, context) {
    return defaultBuildCelebrationRuleSet(feastFile, commemorations, context);
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
    return selectPsalmodyRoman1960({
      hour: params.hour,
      celebration: params.celebration,
      celebrationRules: params.celebrationRules,
      hourRules: params.hourRules,
      temporal: params.temporal
    });
  },
  hourDirectives(params: HourDirectivesParams): ReadonlySet<HourDirective> {
    return deriveSeasonalDirectives1960({
      hour: params.hour,
      celebrationRules: params.celebrationRules,
      hourRules: params.hourRules,
      temporal: params.temporal,
      ...(params.overlay ? { overlay: params.overlay } : {})
    });
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

    const classSymbol = params.celebration.rank.classSymbol;

    // RI §95: Ember Saturdays keep their fuller Matins shape.
    if (classSymbol === 'II-ember-day' && params.temporal.dayOfWeek === 6) {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      };
    }

    // RI §§165-166, §221: unprivileged ferias collapse to one nocturn with
    // three lessons in the 1960 simplification.
    if (isFerialClass(classSymbol) && isLikelyFerialTemporal(params)) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    // RI §§165-168, §220: Sundays and I/II/III-class feasts retain 3x3 Matins.
    if (
      classSymbol === 'I' ||
      classSymbol === 'II' ||
      classSymbol === 'III' ||
      classSymbol.startsWith('I-privilegiata-')
    ) {
      return {
        nocturns: 3,
        totalLessons: 9,
        lessonsPerNocturn: [3, 3, 3]
      };
    }

    if (params.celebrationRules.matins.nocturns === 1 || configured === 3) {
      return {
        nocturns: 1,
        totalLessons: 3,
        lessonsPerNocturn: [3]
      };
    }

    return {
      nocturns: 3,
      totalLessons: 9,
      lessonsPerNocturn: [3, 3, 3]
    };
  },
  resolveTeDeum(params: {
    readonly plan: Pick<MatinsPlan, 'nocturns' | 'totalLessons'>;
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

    // RI §221: on 1960 ferial Matins (3 lessons), the final responsory
    // replaces Te Deum.
    if (
      params.plan.totalLessons === 3 &&
      isFerialClass(params.temporal.rank.classSymbol)
    ) {
      return 'replace-with-responsory';
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
  octavesEnabled(_feastRef: FeastReference): null {
    return null;
  }
};

function compareCandidates1960(a: Candidate, b: Candidate): number {
    const privilegedOverride = comparePrivilegedTemporal(a, b);
    if (privilegedOverride !== null) {
      return privilegedOverride;
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

  if (temporal.rank.classSymbol === 'II-ember-day') {
    // RI (1960) §95 treats Quattuor Tempora ferias as retaining their Office in occurrence.
    // Phase 2c models that by forcing ember ferias ahead of sanctoral competitors.
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

function isLikelyFerialTemporal(params: {
  readonly celebration: Celebration;
  readonly temporal: TemporalContext;
}): boolean {
  if (params.celebration.source !== 'temporal') {
    return false;
  }

  const classSymbol = params.temporal.rank.classSymbol;
  if (classSymbol === 'II-ember-day' || classSymbol === 'IV-lenten-feria') {
    return true;
  }

  if (classSymbol !== 'IV') {
    return false;
  }

  return /-\d$/u.test(params.temporal.dayName);
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
