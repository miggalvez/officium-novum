import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  DayOfficeSummary,
  HourName,
  HourStructure,
  ResolvedVersion,
  SlotContent,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { composeMatinsSections } from './compose/matins.js';
import { applyDirectives } from './directives/index.js';
import { flattenConditionals } from './flatten/index.js';
import { emitSection } from './emit/index.js';
import { expandDeferredNodes } from './resolve/expand-deferred-nodes.js';
import { resolveReference } from './resolve/reference-resolver.js';
import type { ComposedHour, ComposeOptions, Section } from './types/composed-hour.js';

const MAX_DEFERRED_DEPTH = 8;

export interface ComposeInput {
  readonly corpus: TextIndex;
  readonly summary: DayOfficeSummary;
  readonly version: ResolvedVersion;
  readonly hour: HourName;
  readonly options: ComposeOptions;
}

/**
 * Assemble a {@link ComposedHour} for a given date/Hour/language set. Pure
 * function: consumes the corpus text index (Phase 1), the day-office summary
 * (Phase 2), and the resolved version, and emits a format-agnostic document.
 *
 * Expects a Phase-1-resolved corpus (`loadCorpus()` default behavior). This
 * phase still expands deferred node kinds that Phase 1 intentionally leaves in
 * place (`psalmInclude`, `macroRef`, `formulaRef`) and surfaces any residual
 * unresolved `reference` nodes in the output rather than dropping them.
 *
 * The pipeline for each slot is:
 *   1. Collect {@link TextReference}s from the slot content.
 *   2. Resolve each reference per requested language (with fallback chain).
 *   3. Expand deferred macros/formulas/psalm includes.
 *   4. Flatten conditional {@link TextContent} using the day's context.
 *   5. Apply {@link HourDirective} post-transforms.
 *   6. Emit a {@link Section} with merged parallel-language lines.
 */
export function composeHour(input: ComposeInput): ComposedHour {
  const hour = input.summary.hours[input.hour];
  if (!hour) {
    throw new Error(`HourStructure for ${input.hour} is not present on DayOfficeSummary`);
  }

  const context = buildConditionContext(input.summary, input.version);
  const sections: Section[] = [];

  // Matins is plan-shaped (§16.3): composition walks InvitatoriumSource /
  // NocturnPlan / te-deum decisions rather than the generic SlotContent
  // dispatch. The generic path still emits the non-Matins slots (oration,
  // conclusion, commemorations, etc.) after the Matins-specific output.
  if (input.hour === 'matins') {
    sections.push(
      ...composeMatinsSections(hour, {
        corpus: input.corpus,
        options: input.options,
        directives: hour.directives,
        context
      })
    );
  }

  for (const [slotName, slotContent] of Object.entries(hour.slots) as ReadonlyArray<
    [SlotName, SlotContent]
  >) {
    if (!slotContent) continue;
    if (input.hour === 'matins' && isMatinsOwnedSlot(slotName, slotContent)) {
      continue;
    }
    const section = composeSlot({
      slot: slotName,
      content: slotContent,
      hour: input.hour,
      directives: hour.directives,
      corpus: input.corpus,
      options: input.options,
      context
    });
    if (section) {
      sections.push(section);
    }
  }

  return Object.freeze({
    date: input.summary.date,
    hour: input.hour,
    celebration: input.summary.celebration.feastRef.title,
    languages: Object.freeze(Array.from(input.options.languages)),
    sections: Object.freeze(sections)
  });
}

/**
 * Matins owns slots that are plan-shaped or already composed by the
 * Matins-specific pass. We explicitly list them to avoid double-emission
 * when falling through to the generic dispatcher.
 */
function isMatinsOwnedSlot(slot: SlotName, content: SlotContent): boolean {
  if (slot === 'invitatory' || slot === 'psalmody' || slot === 'te-deum') {
    return true;
  }
  if (slot === 'hymn' && content.kind === 'single-ref') {
    return true;
  }
  return false;
}

interface ComposeSlotArgs {
  readonly slot: SlotName;
  readonly content: SlotContent;
  readonly hour: HourName;
  readonly directives: HourStructure['directives'];
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
}

function composeSlot(args: ComposeSlotArgs): Section | undefined {
  const refs = referencesFrom(args.content);
  if (refs.length === 0) return undefined;

  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  const primary = refs[0];
  for (const ref of refs) {
    const resolved = resolveReference(args.corpus, ref, {
      languages: args.options.languages,
      langfb: args.options.langfb,
      dayOfWeek: args.context.dayOfWeek
    });
    for (const lang of args.options.languages) {
      const bucket = perLanguage.get(lang);
      if (!bucket) continue;
      const section = resolved[lang];
      if (!section) continue;
      if (section.selectorMissing) {
        // Phase 2 emitted a `selector: 'missing'` sentinel — the source
        // section does not exist, so surface a rubric placeholder rather
        // than silently rendering whatever remained in the section.
        bucket.push({
          type: 'rubric',
          value: `(Section missing: ${ref.section})`
        });
        continue;
      }
      const expanded = expandDeferredNodes(section.content, {
        index: args.corpus,
        language: lang,
        langfb: args.options.langfb,
        seen: new Set(),
        maxDepth: MAX_DEFERRED_DEPTH
      });
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives(args.slot, flattened, {
        hour: args.hour,
        directives: args.directives
      });
      bucket.push(...transformed);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  return emitSection(args.slot, frozen, primary ? referenceKey(primary) : undefined);
}

function referencesFrom(content: SlotContent): readonly TextReference[] {
  switch (content.kind) {
    case 'single-ref':
      return [content.ref];
    case 'ordered-refs':
      return content.refs;
    case 'psalmody':
      return content.psalms.flatMap((assignment) =>
        assignment.antiphonRef ? [assignment.antiphonRef, assignment.psalmRef] : [assignment.psalmRef]
      );
    case 'empty':
    case 'matins-invitatorium':
    case 'matins-nocturns':
    case 'te-deum':
      return [];
  }
}

function referenceKey(ref: TextReference): string {
  return `${ref.path}#${ref.section}${ref.selector ? `:${ref.selector}` : ''}`;
}

function buildConditionContext(
  summary: DayOfficeSummary,
  version: ResolvedVersion
): ConditionEvalContext {
  const [yearStr, monthStr, dayStr] = summary.date.split('-');
  return {
    date: {
      year: Number(yearStr),
      month: Number(monthStr),
      day: Number(dayStr)
    },
    dayOfWeek: summary.temporal.dayOfWeek,
    season: summary.temporal.season,
    version
  };
}
