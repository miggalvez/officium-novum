import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  HourName,
  HourStructure,
  SlotContent,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/index.js';
import { markAntiphonFirstText } from '../emit/antiphon-marker.js';
import { emitSection } from '../emit/index.js';
import { flattenConditionals } from '../flatten/index.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { ComposeOptions, ComposeWarning, Section } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';
import { resolveGloriaOmittiturReplacement } from './gloria-omittitur.js';
import {
  normalizeRepeatedAntiphonContent,
  withPsalmGloriaPatri
} from './psalmody.js';

const MAX_DEFERRED_DEPTH = 8;

export interface LucanCanticleComposeArgs {
  readonly slot: SlotName;
  readonly content: SlotContent;
  readonly hour: HourName;
  readonly structure: HourStructure;
  readonly directives: HourStructure['directives'];
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

export function composeLucanCanticleSection(args: LucanCanticleComposeArgs): Section | undefined {
  if (!isLucanCanticleSlot(args.slot) || args.content.kind !== 'single-ref') {
    return undefined;
  }

  const perLanguage = new Map<string, readonly TextContent[]>();
  for (const language of args.options.languages) {
    const resolved = resolveReference(args.corpus, args.content.ref, {
      languages: [language],
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const section = resolved[language];
    if (!section || section.selectorMissing) {
      continue;
    }

    const gloriaOmittiturReplacement = resolveGloriaOmittiturReplacement({
      directives: args.directives,
      corpus: args.corpus,
      language,
      langfb: args.options.langfb,
      context: args.context,
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const expanded = expandDeferredNodes(withPsalmGloriaPatri(section.content), {
      index: args.corpus,
      language,
      langfb: args.options.langfb,
      season: args.context.season,
      seen: new Set(),
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives(args.slot, flattened, {
      hour: args.hour,
      directives: args.directives,
      gloriaOmittiturReplacement
    });

    const bucket = [...formatLucanCanticleContent(transformed)];
    const repeatedAntiphon = resolveRepeatedCanticleAntiphon(args, language);
    if (repeatedAntiphon.length > 0) {
      appendContentWithBoundary(bucket, repeatedAntiphon);
    }
    if (bucket.length > 0) {
      perLanguage.set(language, Object.freeze(bucket));
    }
  }

  if (perLanguage.size === 0) {
    return undefined;
  }

  return emitSection(args.slot, perLanguage, referenceKey(args.content.ref));
}

function formatLucanCanticleContent(content: readonly TextContent[]): readonly TextContent[] {
  const bucket: TextContent[] = [];
  let splitTitle = false;

  for (const node of content) {
    if (!splitTitle && node.type === 'text') {
      const parts = splitLucanCanticleTitle(node.value);
      if (parts) {
        bucket.push({ type: 'text', value: parts.title });
        bucket.push({ type: 'separator' });
        bucket.push({ type: 'text', value: parts.citation });
        bucket.push({ type: 'separator' });
        splitTitle = true;
        continue;
      }
    }

    bucket.push(node);
    if (node.type === 'text') {
      bucket.push({ type: 'separator' });
    }
  }

  return Object.freeze(bucket);
}

function splitLucanCanticleTitle(
  text: string
): { readonly title: string; readonly citation: string } | undefined {
  const match = text.trim().match(/^\((.+?)\s+\*\s+(.+)\)$/u);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    title: match[1].trim(),
    citation: match[2].trim()
  };
}

function resolveRepeatedCanticleAntiphon(
  args: LucanCanticleComposeArgs,
  language: string
): readonly TextContent[] {
  const antiphonSlot = lucanCanticleAntiphonSlot(args.slot);
  if (!antiphonSlot) {
    return [];
  }

  const content = args.structure.slots[antiphonSlot];
  if (!content) {
    return [];
  }

  const ref = refsFromSlotContent(content)[0];
  if (!ref) {
    return [];
  }

  const resolved = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const section = resolved[language];
  if (!section || section.selectorMissing) {
    return [];
  }

  const expanded = expandDeferredNodes(section.content, {
    index: args.corpus,
    language,
    langfb: args.options.langfb,
    season: args.context.season,
    seen: new Set(),
    maxDepth: MAX_DEFERRED_DEPTH,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  const flattened = flattenConditionals(expanded, args.context);
  const transformed = applyDirectives(
    antiphonSlot,
    markAntiphonFirstText(flattened),
    {
      hour: args.hour,
      directives: args.directives
    }
  );

  return normalizeRepeatedAntiphonContent(transformed);
}

function isLucanCanticleSlot(slot: SlotName): boolean {
  return (
    slot === 'canticle-ad-benedictus' ||
    slot === 'canticle-ad-magnificat' ||
    slot === 'canticle-ad-nunc-dimittis'
  );
}

function lucanCanticleAntiphonSlot(
  slot: SlotName
): 'antiphon-ad-benedictus' | 'antiphon-ad-magnificat' | 'antiphon-ad-nunc-dimittis' | undefined {
  return (
    slot === 'canticle-ad-benedictus' ? 'antiphon-ad-benedictus'
    : slot === 'canticle-ad-magnificat' ? 'antiphon-ad-magnificat'
    : slot === 'canticle-ad-nunc-dimittis' ? 'antiphon-ad-nunc-dimittis'
    : undefined
  );
}

function refsFromSlotContent(content: SlotContent): readonly TextReference[] {
  switch (content.kind) {
    case 'single-ref':
      return [content.ref];
    case 'ordered-refs':
      return content.refs;
    default:
      return [];
  }
}

function referenceKey(ref: TextReference): string {
  return `${ref.path}#${ref.section}${ref.selector ? `:${ref.selector}` : ''}`;
}
