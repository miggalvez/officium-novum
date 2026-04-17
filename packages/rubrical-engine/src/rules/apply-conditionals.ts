import type { TextContent } from '@officium-novum/parser';

import { conditionMatches, type ConditionEvalContext } from '../internal/conditions.js';
import type { CelebrationRuleSet, RuleEvaluationContext } from '../types/rule-set.js';

export interface RuleEvalContext extends RuleEvaluationContext, ConditionEvalContext {
  readonly celebrationRules: CelebrationRuleSet;
}

export function evaluateConditionalBlock(
  content: readonly TextContent[],
  context: RuleEvalContext
): readonly TextContent[] {
  const output: TextContent[] = [];

  for (const part of content) {
    if (part.type !== 'conditional') {
      output.push(part);
      continue;
    }

    if (!conditionMatches(part.condition, context)) {
      continue;
    }

    output.push(...evaluateConditionalBlock(part.content, context));
  }

  return Object.freeze(output);
}
