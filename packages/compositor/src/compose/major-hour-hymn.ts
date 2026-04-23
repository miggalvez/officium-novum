import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourName,
  HourStructure,
  SlotContent,
  TextReference
} from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/index.js';
import { flattenConditionals } from '../flatten/index.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { ComposeOptions, ComposeWarning } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';

const MAX_DEFERRED_DEPTH = 8;

export interface MajorHourHymnArgs {
  readonly slot: string;
  readonly hour: HourName;
  readonly summary: DayOfficeSummary;
  readonly directives: HourStructure['directives'];
  readonly structure: HourStructure;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly hymnDoxology?: SlotContent;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

export function resolveHymnDoxologyByLanguage(
  args: MajorHourHymnArgs
): ReadonlyMap<string, readonly TextContent[]> | undefined {
  if (args.slot !== 'hymn') {
    return undefined;
  }

  const majorHourSource = args.hymnDoxology ? undefined : majorHourHymnDoxologySource(args);
  const refs = args.hymnDoxology
    ? refsFromDoxologyContent(args.hymnDoxology)
    : majorHourSource
      ? [majorHourSource.ref]
      : [];
  if (refs.length === 0) {
    return undefined;
  }

  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  for (const ref of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek,
      date: args.context.date,
      season: args.context.season,
      version: args.context.version,
      modernStyleMonthday: args.context.version.handle.includes('1960'),
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });

    for (const lang of args.options.languages) {
      const bucket = perLanguage.get(lang);
      const section = resolved[lang];
      if (!bucket || !section || section.selectorMissing) {
        continue;
      }

      const expanded = expandDeferredNodes(section.content, {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        season: args.context.season,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH,
        ...(args.onWarning ? { onWarning: args.onWarning } : {})
      });
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives('doxology-variant', flattened, {
        hour: args.hour,
        directives: args.directives
      });
      appendContentWithBoundary(bucket, transformed);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) {
      frozen.set(lang, Object.freeze(nodes));
    }
  }
  return frozen.size > 0 ? frozen : undefined;
}

export function replaceFinalHymnDoxology(
  content: readonly TextContent[],
  variant: readonly TextContent[] | undefined
): readonly TextContent[] {
  if (!variant || variant.length === 0 || !containsReplaceableHymnDoxology(content)) {
    return content;
  }

  let lastSeparator = -1;
  for (let index = content.length - 1; index >= 0; index -= 1) {
    if (content[index]?.type === 'separator') {
      lastSeparator = index;
      break;
    }
  }
  if (lastSeparator < 0) {
    return content;
  }

  return Object.freeze([
    ...content.slice(0, lastSeparator + 1),
    ...trimLeadingSeparators(variant)
  ]);
}

export function prependMajorHourHymnWrapper(
  args: MajorHourHymnArgs,
  content: readonly TextContent[],
  headingSource: readonly TextContent[]
): readonly TextContent[] {
  if ((args.hour !== 'lauds' && args.hour !== 'vespers') || content.length === 0) {
    return content;
  }

  const trailingSeparator =
    args.structure.slots.versicle?.kind && args.structure.slots.versicle.kind !== 'empty'
      ? ([{ type: 'separator' } satisfies TextContent] as const)
      : [];

  return Object.freeze([
    { type: 'separator' } satisfies TextContent,
    {
      type: 'gabcNotation',
      notation: {
        kind: 'header',
        notation: '',
        text: majorHourHymnHeading(args, headingSource)
      }
    } satisfies TextContent,
    ...content,
    ...trailingSeparator
  ]);
}

function refsFromDoxologyContent(content: SlotContent): readonly TextReference[] {
  switch (content.kind) {
    case 'single-ref':
      return [content.ref];
    case 'ordered-refs':
      return content.refs;
    default:
      return [];
  }
}

function trimLeadingSeparators(content: readonly TextContent[]): readonly TextContent[] {
  let start = 0;
  while (content[start]?.type === 'separator') {
    start += 1;
  }
  return content.slice(start);
}

function majorHourHymnHeading(
  args: MajorHourHymnArgs,
  content: readonly TextContent[]
): string {
  const doxologyName = majorHourHymnDoxologyName(args, content);
  return doxologyName ? `Hymnus {Doxology: ${doxologyName}}` : 'Hymnus';
}

function majorHourHymnDoxologyName(
  args: MajorHourHymnArgs,
  content: readonly TextContent[]
): string | undefined {
  if (args.context.version.handle.includes('1960') || !containsReplaceableHymnDoxology(content)) {
    return undefined;
  }

  if (args.hour === 'vespers' && /^Pasc7/iu.test(args.summary.temporal.dayName)) {
    return undefined;
  }

  return majorHourHymnDoxologySource(args)?.label;
}

function containsReplaceableHymnDoxology(content: readonly TextContent[]): boolean {
  return content.some((node) => {
    if (node.type === 'text') {
      return /^\*\s+/u.test(node.value);
    }
    if (node.type === 'verseMarker') {
      return /^\*\s+/u.test(node.text);
    }
    if (node.type === 'gabcNotation') {
      const { notation } = node;
      if (notation.kind === 'header' && notation.text) {
        return /^\*\s+/u.test(notation.text);
      }
    }
    return false;
  });
}

function majorHourHymnDoxologySource(
  args: MajorHourHymnArgs
): { readonly ref: TextReference; readonly label: string } | undefined {
  if ((args.hour !== 'lauds' && args.hour !== 'vespers') || args.context.version.handle.includes('1960')) {
    return undefined;
  }

  const specialRef = properHymnDoxologyReference(args);
  if (specialRef) {
    return {
      ref: specialRef,
      label: 'Special'
    };
  }

  const label = args.summary.celebrationRules.doxologyVariant ?? seasonalHymnDoxologyName(args);
  if (!label) {
    return undefined;
  }

  return {
    ref: {
      path: 'horas/Latin/Psalterium/Doxologies',
      section: label
    },
    label
  };
}

function properHymnDoxologyReference(args: MajorHourHymnArgs): TextReference | undefined {
  const properPath = `horas/Latin/${args.summary.celebration.feastRef.path}.txt`;
  const properFile = args.corpus.getFile(properPath);
  if (!properFile?.sections.some((section) => section.header === 'Doxology')) {
    return undefined;
  }

  return {
    path: properPath.replace(/\.txt$/u, ''),
    section: 'Doxology'
  };
}

function seasonalHymnDoxologyName(args: MajorHourHymnArgs): string | undefined {
  const dayName = args.summary.temporal.dayName;
  const dayOfMonth = Number.parseInt(args.summary.date.slice(-2), 10);

  if (/^Nat/iu.test(dayName)) {
    return dayOfMonth >= 6 && dayOfMonth < 13 ? 'Epi' : 'Nat';
  }

  if (/^Epi[01]/iu.test(dayName) && dayOfMonth < 14) {
    return 'Epi';
  }

  if (
    /^Pasc6/iu.test(dayName) ||
    (/^Pasc5/iu.test(dayName) && args.context.dayOfWeek > 3)
  ) {
    return 'Asc';
  }

  if (/^Pasc[0-5]/iu.test(dayName)) {
    return 'Pasch';
  }

  if (/^Pasc7/iu.test(dayName)) {
    return 'Pent';
  }

  return undefined;
}
