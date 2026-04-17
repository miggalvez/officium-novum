import type {
  ConcurrenceReason,
  ConcurrenceResult,
  DayConcurrencePreview,
  VespersSideView
} from '../types/concurrence.js';
import type { TemporalContext } from '../types/model.js';
import type { RubricalPolicy } from '../types/policy.js';

const ABSOLUTE_TRIDUUM_KEYS = new Set(['Quad6-4', 'Quad6-5']);

export function resolveConcurrence(params: {
  readonly today: DayConcurrencePreview;
  readonly tomorrow: DayConcurrencePreview;
  readonly temporal: TemporalContext;
  readonly policy: RubricalPolicy;
}): ConcurrenceResult {
  const today = toTodaySide(params.today);
  const tomorrow = toTomorrowSide(params.tomorrow);

  const treatHolySaturdayAsSpecial =
    params.temporal.dayName === 'Quad6-6' && params.policy.name !== 'divino-afflatu';

  if (ABSOLUTE_TRIDUUM_KEYS.has(params.temporal.dayName) || treatHolySaturdayAsSpecial) {
    return {
      winner: 'today',
      source: today.celebration,
      commemorations: [],
      reason: 'triduum-special',
      warnings: [
        {
          code: 'concurrence-triduum-special',
          message:
            'Sacred Triduum uses its own Vespers/Compline pattern; concurrence matrix is bypassed.',
          severity: 'info',
          context: {
            dayName: params.temporal.dayName,
            date: params.temporal.date
          }
        }
      ]
    };
  }

  if (!today.hasVespers && tomorrow.hasVespers) {
    return vetoResult(
      'tomorrow',
      today.celebration,
      tomorrow.celebration,
      'today-declines-second-vespers'
    );
  }
  if (today.hasVespers && !tomorrow.hasVespers) {
    return vetoResult(
      'today',
      today.celebration,
      tomorrow.celebration,
      'tomorrow-declines-first-vespers'
    );
  }
  if (!today.hasVespers && !tomorrow.hasVespers) {
    return {
      winner: 'today',
      source: today.celebration,
      commemorations: [],
      reason: 'today-only-has-vespers',
      warnings: [
        {
          code: 'concurrence-rule-veto',
          message:
            'Both sides declined Vespers via rule flags; defaulting to today for ferial fallback.',
          severity: 'warn',
          context: {
            today: today.celebration.feastRef.path,
            tomorrow: tomorrow.celebration.feastRef.path
          }
        }
      ]
    };
  }

  if (today.vespersClass === 'nihil' && tomorrow.vespersClass === 'nihil') {
    return {
      winner: 'today',
      source: today.celebration,
      commemorations: [],
      reason: 'today-only-has-vespers',
      warnings: [
        {
          code: 'concurrence-rule-veto',
          message:
            'Neither side provides proper Vespers content; defaulting to today for ferial fallback.',
          severity: 'info',
          context: {
            today: today.celebration.feastRef.path,
            tomorrow: tomorrow.celebration.feastRef.path
          }
        }
      ]
    };
  }
  if (today.vespersClass === 'nihil') {
    return {
      winner: 'tomorrow',
      source: tomorrow.celebration,
      commemorations: [],
      reason: 'tomorrow-only-has-vespers',
      warnings: []
    };
  }
  if (tomorrow.vespersClass === 'nihil') {
    return {
      winner: 'today',
      source: today.celebration,
      commemorations: [],
      reason: 'today-only-has-vespers',
      warnings: []
    };
  }

  return params.policy.resolveConcurrence({
    today,
    tomorrow,
    temporal: params.temporal
  });
}

function toTodaySide(preview: DayConcurrencePreview): VespersSideView {
  return {
    celebration: preview.celebration,
    celebrationRules: preview.celebrationRules,
    vespersClass: preview.secondVespersClass,
    hasVespers: preview.hasSecondVespers
  };
}

function toTomorrowSide(preview: DayConcurrencePreview): VespersSideView {
  return {
    celebration: preview.celebration,
    celebrationRules: preview.celebrationRules,
    vespersClass: preview.firstVespersClass,
    hasVespers: preview.hasFirstVespers
  };
}

function vetoResult(
  winner: 'today' | 'tomorrow',
  todayCelebration: VespersSideView['celebration'],
  tomorrowCelebration: VespersSideView['celebration'],
  reason: ConcurrenceReason
): ConcurrenceResult {
  return {
    winner,
    source: winner === 'today' ? todayCelebration : tomorrowCelebration,
    commemorations: [],
    reason,
    warnings: [
      {
        code: 'concurrence-rule-veto',
        message:
          'Concurrence winner was chosen by explicit Vespers rule flags before rank comparison.',
        severity: 'info',
        context: {
          reason,
          today: todayCelebration.feastRef.path,
          tomorrow: tomorrowCelebration.feastRef.path
        }
      }
    ]
  };
}
