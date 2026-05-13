import type { TextContent } from '@officium-novum/parser';
import {
  conditionMatches,
  type ConditionEvalContext,
  type HourName,
  type SlotName
} from '@officium-novum/rubrical-engine';

interface SubUnicaOrationContext {
  readonly slot: SlotName;
  readonly hour: HourName;
  readonly conditionContext: ConditionEvalContext;
  readonly conclusionMode: 'separate' | 'sub-unica';
}

export function prepareSubUnicaOrationContent(
  context: SubUnicaOrationContext,
  content: readonly TextContent[]
): readonly TextContent[] {
  const withoutPrimaryConclusion = stripSubUnicaPrimaryConclusion(context, content);
  return preserveSubUnicaCommemorationHeadings(context, withoutPrimaryConclusion);
}

export function rendersSubUnicaOrationSeparators(context: SubUnicaOrationContext): boolean {
  return (
    context.slot === 'oration' &&
    (context.hour === 'lauds' || context.hour === 'vespers') &&
    context.conditionContext.version.policy.name === 'rubrics-1960' &&
    context.conclusionMode === 'sub-unica'
  );
}

function stripSubUnicaPrimaryConclusion(
  context: SubUnicaOrationContext,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!rendersSubUnicaOrationSeparators(context)) {
    return content;
  }

  const firstSeparatorIndex = content.findIndex((node) => node.type === 'separator');
  if (firstSeparatorIndex < 0) {
    return content;
  }

  let stripped = false;
  const filtered = content.filter((node, index) => {
    if (index > firstSeparatorIndex) {
      return true;
    }
    if (node.type === 'formulaRef' && isConclusionFormula(node.name)) {
      stripped = true;
      return false;
    }
    return true;
  });

  return stripped ? filtered : content;
}

function isConclusionFormula(name: string): boolean {
  return /^(?:per dominum(?: eiusdem)?|per eundem|per eumdem|qui (?:vivis|tecum|cum patre))$/iu.test(
    name.trim()
  );
}

function preserveSubUnicaCommemorationHeadings(
  context: SubUnicaOrationContext,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!rendersSubUnicaOrationSeparators(context)) {
    return content;
  }

  const out: TextContent[] = [];
  let changed = false;
  for (const node of content) {
    if (node.type !== 'conditional') {
      out.push(node);
      continue;
    }

    if (
      isHaecVersusScope(node.condition.scopeDescriptor) &&
      !conditionMatches(node.condition, context.conditionContext)
    ) {
      const heading = node.content.find(
        (child) => child.type === 'rubric' && /^Commemoratio\b/iu.test(child.value.trim())
      );
      if (heading) {
        out.push(heading);
        changed = true;
      }
    }

    const nestedContent = preserveSubUnicaCommemorationHeadings(context, node.content);
    if (nestedContent !== node.content) {
      changed = true;
    }

    out.push({
      ...node,
      content: [...nestedContent]
    });
  }

  return changed ? out : content;
}

function isHaecVersusScope(scope: string | undefined): boolean {
  return scope === 'hæc versus' || scope === 'haec versus';
}
