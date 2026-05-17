import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  HourDirective
} from '@officium-novum/rubrical-engine';

import { flattenConditionals } from '../flatten/index.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import type { ComposeWarning } from '../types/composed-hour.js';

export interface GloriaOmittiturReplacementArgs {
  readonly directives: readonly HourDirective[];
  readonly corpus: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly context: ConditionEvalContext;
  readonly maxDepth: number;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

export function resolveGloriaOmittiturReplacement(
  args: GloriaOmittiturReplacementArgs
): readonly TextContent[] | undefined {
  if (
    !args.directives.includes('omit-gloria-patri') &&
    !args.directives.includes('omit-responsory-gloria') &&
    !args.directives.includes('requiem-gloria')
  ) {
    return undefined;
  }

  const formula = args.directives.includes('requiem-gloria') ? 'Requiem' : 'Gloria omittitur';
  const expanded = expandDeferredNodes([{ type: 'formulaRef', name: formula }], {
    index: args.corpus,
    language: args.language,
    langfb: args.langfb,
    season: args.context.season,
    conditionContext: args.context,
    seen: new Set(),
    maxDepth: args.maxDepth,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const flattened = flattenConditionals(expanded, args.context);
  return flattened.length > 0 ? flattened : undefined;
}
