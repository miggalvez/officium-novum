import type { DayConcurrencePreview } from '../types/concurrence.js';
import type {
  ComplineSource,
  HourDirective,
  HourStructure
} from '../types/hour-structure.js';
import type { RubricalPolicy } from '../types/policy.js';

export function buildCompline(params: {
  readonly concurrence: Parameters<RubricalPolicy['complineSource']>[0]['concurrence'];
  readonly today: DayConcurrencePreview;
  readonly tomorrow: DayConcurrencePreview;
  readonly policy: RubricalPolicy;
}): HourStructure {
  const source = params.policy.complineSource({
    concurrence: params.concurrence,
    today: params.today,
    tomorrow: params.tomorrow
  });

  return {
    hour: 'compline',
    source,
    slots: {},
    directives: deriveComplineDirectives(source, params.today, params.tomorrow)
  };
}

function deriveComplineDirectives(
  source: ComplineSource,
  today: DayConcurrencePreview,
  tomorrow: DayConcurrencePreview
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
  if (sourceDate.temporal.dayOfWeek === 0) {
    return ['preces-dominicales'];
  }

  return [];
}
