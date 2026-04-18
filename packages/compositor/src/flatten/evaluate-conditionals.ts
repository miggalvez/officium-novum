import type { TextContent } from '@officium-novum/parser';
import { conditionMatches, type ConditionEvalContext } from '@officium-novum/rubrical-engine';

/**
 * Recursively flatten {@link TextContent} trees by dropping conditional nodes
 * whose condition does not match the given context, and splicing in the
 * children of conditionals whose condition does match.
 *
 * Mirrors the engine's internal `evaluateConditionalBlock` but takes only a
 * {@link ConditionEvalContext} — the composition engine does not have (and
 * does not need) a full rule-evaluation context at this stage.
 */
export function flattenConditionals(
  content: readonly TextContent[],
  context: ConditionEvalContext
): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type !== 'conditional') {
      out.push(node);
      continue;
    }
    if (!conditionMatches(node.condition, context)) {
      continue;
    }
    out.push(...flattenConditionals(node.content, context));
  }
  return Object.freeze(out);
}
