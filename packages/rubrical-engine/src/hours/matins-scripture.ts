import type { ScriptureTransferEntry } from '@officium-novum/parser';

import type { RubricalWarning } from '../types/directorium.js';
import type {
  LessonIndex,
  LessonPlan,
  MatinsPlan,
  NocturnPlan,
  PericopeRef
} from '../types/matins.js';
import type { TextReference } from '../types/hour-structure.js';

export function applyScriptureTransfer(
  plan: MatinsPlan,
  transfer: ScriptureTransferEntry | undefined,
  warnings: RubricalWarning[]
): MatinsPlan {
  if (!transfer) {
    return plan;
  }

  const op = transfer.operation ?? 'R';
  const pericope = transferPericope(transfer.target);

  warnings.push({
    code: 'matins-scripture-transfer-applied',
    message: 'Applied Directorium scripture-transfer directive to Matins lesson sources.',
    severity: 'info',
    context: {
      operation: op,
      target: transfer.target
    }
  });

  if (op === 'R') {
    return rewriteAllScriptureLessons(plan, pericope, 'R');
  }

  if (op === 'B') {
    return rewriteFirstScriptureLesson(plan, pericope, 'B');
  }

  return appendTransferredLesson(plan, pericope);
}

function rewriteAllScriptureLessons(
  plan: MatinsPlan,
  pericope: PericopeRef,
  op: 'R'
): MatinsPlan {
  const nocturnPlan = plan.nocturnPlan.map((nocturn) => ({
    ...nocturn,
    lessons: nocturn.lessons.map((lesson) =>
      lesson.source.kind === 'scripture'
        ? {
            ...lesson,
            source: {
              kind: 'scripture-transferred',
              pericope,
              op
            }
          }
        : lesson
    )
  })) as readonly NocturnPlan[];

  return {
    ...plan,
    nocturnPlan
  };
}

function rewriteFirstScriptureLesson(
  plan: MatinsPlan,
  pericope: PericopeRef,
  op: 'B'
): MatinsPlan {
  let rewritten = false;
  const nocturnPlan = plan.nocturnPlan.map((nocturn) => ({
    ...nocturn,
    lessons: nocturn.lessons.map((lesson) => {
      if (rewritten || lesson.source.kind !== 'scripture') {
        return lesson;
      }
      rewritten = true;
      return {
        ...lesson,
        source: {
          kind: 'scripture-transferred',
          pericope,
          op
        }
      };
    })
  })) as readonly NocturnPlan[];

  return {
    ...plan,
    nocturnPlan
  };
}

function appendTransferredLesson(plan: MatinsPlan, pericope: PericopeRef): MatinsPlan {
  const firstNocturn = plan.nocturnPlan[0];
  if (!firstNocturn) {
    return plan;
  }

  const highestIndex = maxLessonIndex(plan.nocturnPlan);
  const appendedIndex = toLessonIndex(Math.min(highestIndex + 1, 12));
  const appendedLesson: LessonPlan = {
    index: appendedIndex,
    source: {
      kind: 'scripture-transferred',
      pericope,
      op: 'A'
    }
  };

  const updatedFirstNocturn: NocturnPlan = {
    ...firstNocturn,
    lessons: [...firstNocturn.lessons, appendedLesson]
  };
  const nocturnPlan = [updatedFirstNocturn, ...plan.nocturnPlan.slice(1)] as readonly NocturnPlan[];

  const firstCount = plan.lessonsPerNocturn[0] ?? 0;
  const lessonsPerNocturn = [
    firstCount + 1,
    ...plan.lessonsPerNocturn.slice(1)
  ] as readonly number[];

  const totalLessons = toTotalLessons(plan.totalLessons + 1);

  return {
    ...plan,
    nocturnPlan,
    lessonsPerNocturn,
    totalLessons
  };
}

function transferPericope(target: string): PericopeRef {
  return {
    book: 'scripture-transfer',
    reference: transferTargetReference(target)
  };
}

function transferTargetReference(target: string): TextReference {
  const trimmed = target.trim();
  if (trimmed.startsWith('horas/')) {
    return {
      path: trimmed,
      section: 'Lectio1'
    };
  }

  if (trimmed.includes('/')) {
    return {
      path: `horas/Latin/${trimmed}`,
      section: 'Lectio1'
    };
  }

  return {
    path: `horas/Latin/Tempora/${trimmed}`,
    section: 'Lectio1'
  };
}

function maxLessonIndex(nocturns: readonly NocturnPlan[]): number {
  let max = 1;
  for (const nocturn of nocturns) {
    for (const lesson of nocturn.lessons) {
      if (lesson.index > max) {
        max = lesson.index;
      }
    }
  }
  return max;
}

function toLessonIndex(value: number): LessonIndex {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }
  if (value === 7 || value === 8 || value === 9 || value === 10 || value === 11 || value === 12) {
    return value;
  }
  return 12;
}

function toTotalLessons(value: number): MatinsPlan['totalLessons'] {
  if (value === 3 || value === 4 || value === 9 || value === 10 || value === 12) {
    return value;
  }
  return value > 10 ? 12 : 10;
}
