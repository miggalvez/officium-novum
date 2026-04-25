import { type TextContent, type TextIndex } from '@officium-novum/parser';
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

import { stripLaudsSecretoPrayers } from './compose/incipit.js';
import { appendContentWithBoundary } from './compose/content-boundary.js';
import { directiveDrivenSlotContent } from './compose/directive-slot-content.js';
import { resolveGloriaOmittiturReplacement } from './compose/gloria-omittitur.js';
import { composeLucanCanticleSection } from './compose/lucan-canticle.js';
import {
  prependMajorHourHymnWrapper,
  replaceFinalHymnDoxology,
  resolveHymnDoxologyByLanguage
} from './compose/major-hour-hymn.js';
import { composeMatinsSections } from './compose/matins.js';
import { composePrimeMartyrologySection } from './compose/prime-martyrology.js';
import {
  appendExpandedPsalmWrapper,
  buildPsalmHeading,
  containsInlinePsalmRefs,
  extractInlinePsalmAntiphons,
  isMinorHour,
  normalizeOpeningPsalmodyAntiphonContent,
  normalizeRepeatedAntiphonContent,
  replaceLeadingCanticleTitleWithCitation,
  splitLeadingPsalmAntiphon,
  withPsalmGloriaPatri
} from './compose/psalmody.js';
import { MAX_DEFERRED_DEPTH, referenceKey } from './compose/shared.js';
import {
  composeTriduumSpecialComplineSection,
  composeTriduumSuppressedVespersSection
} from './compose/triduum-special.js';
import { applyDirectives } from './directives/index.js';
import { isWholeAntiphonSlot, markAntiphonFirstText } from './emit/antiphon-marker.js';
import { emitSection } from './emit/index.js';
import { flattenConditionals } from './flatten/index.js';
import { expandDeferredNodes } from './resolve/expand-deferred-nodes.js';
import { resolveReference } from './resolve/reference-resolver.js';
import type {
  ComposedHour,
  ComposedLine,
  ComposedRun,
  ComposeOptions,
  ComposeWarning,
  Section
} from './types/composed-hour.js';

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
  const hymnDoxology = hour.slots['doxology-variant'];
  // Phase 3 §3f: warnings surfaced from the reference resolver,
  // deferred-node expander, and downstream Matins plan walker. Each
  // slot-compose pass pushes into this array; the aggregate lands on
  // `ComposedHour.warnings`.
  const warnings: ComposeWarning[] = [];
  const onWarning = (warning: ComposeWarning): void => {
    warnings.push(warning);
  };

  const suppressedVespers = composeTriduumSuppressedVespersSection({
    hour: input.hour,
    summary: input.summary,
    corpus: input.corpus,
    options: input.options,
    context,
    onWarning
  });
  if (suppressedVespers) {
    sections.push(suppressedVespers);
  }

  const specialCompline = composeTriduumSpecialComplineSection({
    hour: input.hour,
    structure: hour,
    summary: input.summary,
    corpus: input.corpus,
    options: input.options,
    context,
    onWarning
  });
  if (specialCompline) {
    sections.push(specialCompline);
    return Object.freeze({
      date: input.summary.date,
      hour: input.hour,
      celebration: input.summary.celebration.feastRef.title,
      languages: Object.freeze(Array.from(input.options.languages)),
      sections: Object.freeze(sections),
      warnings: Object.freeze(warnings)
    });
  }

  // Matins is plan-shaped (§16.3): composition walks InvitatoriumSource /
  // NocturnPlan / te-deum decisions rather than the generic SlotContent
  // dispatch. The generic path still emits the non-Matins slots (oration,
  // conclusion, commemorations, etc.) after the Matins-specific output.
  if (input.hour === 'matins') {
    const incipit = hour.slots.incipit;
    if (incipit) {
      const section = composeSlot({
        slot: 'incipit',
        content: incipit,
        hour: input.hour,
        summary: input.summary,
        directives: hour.directives,
        structure: hour,
        corpus: input.corpus,
        options: input.options,
        context,
        onWarning
      });
      if (section) {
        sections.push(section);
      }
    }

    sections.push(
      ...composeMatinsSections(hour, {
        corpus: input.corpus,
        summary: input.summary,
        options: input.options,
        directives: hour.directives,
        context,
        onWarning
      })
    );
  }

  for (const [slotName, slotContent] of Object.entries(hour.slots) as ReadonlyArray<
    [SlotName, SlotContent]
  >) {
    if (!slotContent) continue;
    if (slotName === 'doxology-variant') {
      continue;
    }
    if (input.hour === 'matins' && slotName === 'incipit') {
      continue;
    }
    if (input.hour === 'matins' && isMatinsOwnedSlot(slotName, slotContent)) {
      continue;
    }
    const section = composeSlot({
      slot: slotName,
      content: slotContent,
      hour: input.hour,
      summary: input.summary,
      directives: hour.directives,
      structure: hour,
      corpus: input.corpus,
      options: input.options,
      context,
      ...(slotName === 'hymn' && hymnDoxology ? { hymnDoxology } : {}),
      onWarning
    });
    if (section) {
      sections.push(withMinorHourLaterBlockSeparator(input.hour, slotName, hour, section));
    }
  }

  return Object.freeze({
    date: input.summary.date,
    hour: input.hour,
    celebration: input.summary.celebration.feastRef.title,
    languages: Object.freeze(Array.from(input.options.languages)),
    sections: Object.freeze(sections),
    warnings: Object.freeze(warnings)
  });
}

function normalizeResponsoryGloria(
  args: ComposeSlotArgs,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (args.slot !== 'responsory') {
    return content;
  }

  let changed = false;
  const out: TextContent[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const node = content[index]!;
    if (node.type === 'conditional') {
      const normalizedContent = normalizeResponsoryGloria(args, node.content);
      if (normalizedContent !== node.content) {
        changed = true;
        out.push({
          ...node,
          content: [...normalizedContent]
        });
      } else {
        out.push(node);
      }
      continue;
    }
    if (isResponsorySicutEratNode(node)) {
      changed = true;
      continue;
    }
    out.push(node);
  }
  return changed ? Object.freeze(out) : content;
}

function isResponsorySicutEratNode(node: TextContent): boolean {
  if (node.type === 'verseMarker') {
    return /^r\.?$/iu.test(node.marker.trim()) && /^sicut erat\b/iu.test(node.text.trim());
  }
  if (node.type === 'text') {
    return /^r\.\s*sicut erat\b/iu.test(node.value.trim());
  }
  return false;
}

function withMinorHourLaterBlockSeparator(
  hour: HourName,
  slot: SlotName,
  structure: HourStructure,
  section: Section
): Section {
  if (!isMinorHour(hour) || (slot !== 'responsory' && slot !== 'versicle')) {
    return section;
  }
  if (slot === 'responsory' && !isRenderableLaterBlockSlot(structure.slots.chapter)) {
    return section;
  }
  if (
    slot === 'versicle' &&
    !isRenderableLaterBlockSlot(structure.slots.chapter) &&
    !isRenderableLaterBlockSlot(structure.slots.responsory)
  ) {
    return section;
  }

  return Object.freeze({
    ...section,
    lines: Object.freeze([minorHourSeparatorLine(section.languages), ...section.lines])
  });
}

function isRenderableLaterBlockSlot(content: SlotContent | undefined): boolean {
  return content !== undefined && content.kind !== 'empty';
}

function minorHourSeparatorLine(languages: readonly string[]): ComposedLine {
  const texts: Record<string, readonly ComposedRun[]> = {};
  for (const language of languages) {
    texts[language] = Object.freeze([{ type: 'text', value: '_' }]);
  }
  return Object.freeze({
    texts: Object.freeze(texts)
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
  readonly summary: DayOfficeSummary;
  readonly directives: HourStructure['directives'];
  readonly structure: HourStructure;
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly context: ConditionEvalContext;
  readonly hymnDoxology?: SlotContent;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

interface TaggedRef {
  readonly ref: TextReference;
  readonly isAntiphon: boolean;
  readonly openingAntiphon?: boolean;
  readonly repeatAntiphon?: boolean;
  /**
   * True when the psalm assignment also carried an explicit `antiphonRef`.
   * Wrapper sections such as `Psalmi major:Day0 Vespera` already embed their
   * own inline antiphons on each inner `psalmRef`; when an explicit antiphon
   * is present, the compositor suppresses only the first inline antiphon so
   * the rendered stream does not duplicate it before the first heading.
   */
  readonly hasExplicitAntiphon?: boolean;
  /**
   * 1-based position of this ref within the psalmody slot, counting every
   * {@link PsalmAssignment} (both psalms and any canticle assignments). Used
   * to emit the `Psalmus N [index]` heading that Perl prints before each
   * psalm at Lauds, Vespers, Prime, and the minor hours. `undefined` for
   * non-psalmody slots and for the antiphon half of each assignment pair.
   */
  readonly psalmIndex?: number;
}

function composeSlot(args: ComposeSlotArgs): Section | undefined {
  const primeMartyrology = composePrimeMartyrologySection(args);
  if (primeMartyrology) {
    return primeMartyrology;
  }

  const lucanCanticle = composeLucanCanticleSection(args);
  if (lucanCanticle) {
    return lucanCanticle;
  }

  const effectiveContent = directiveDrivenSlotContent(args) ?? args.content;
  const refs = taggedReferencesFrom(args.hour, args.slot, effectiveContent);
  if (refs.length === 0) return undefined;

  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }
  const hymnDoxologyByLanguage = resolveHymnDoxologyByLanguage(args);

  const primary = refs[0]?.ref;
  for (const { ref, isAntiphon, openingAntiphon, psalmIndex, hasExplicitAntiphon, repeatAntiphon } of refs) {
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
      if (!bucket) continue;
      const gloriaOmittiturReplacement =
        args.slot === 'psalmody' || args.slot === 'responsory'
          ? resolveGloriaOmittiturReplacement({
              directives: args.directives,
              corpus: args.corpus,
              language: lang,
              langfb: args.options.langfb,
              context: args.context,
              maxDepth: MAX_DEFERRED_DEPTH,
              ...(args.onWarning ? { onWarning: args.onWarning } : {})
            })
          : undefined;
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
      // Caller-supplied rubric intent per ADR-010: when the caller has just
      // prayed Matins and is continuing into Lauds, suppress the secreto
      // Pater / Ave block at the head of the Lauds `#Incipit`. The filter is
      // a no-op for every other Hour and slot.
      const sourceContent =
        args.hour === 'lauds' &&
        args.slot === 'incipit' &&
        args.options.joinLaudsToMatins === true
          ? stripLaudsSecretoPrayers(section.content)
          : section.content;
      if (args.slot === 'psalmody' && isAntiphon && containsInlinePsalmRefs(sourceContent)) {
        const antiphonOnly = markAntiphonFirstText(extractInlinePsalmAntiphons(sourceContent));
        const flattened = flattenConditionals(antiphonOnly, args.context);
        const transformed = applyDirectives(args.slot, flattened, {
          hour: args.hour,
          directives: args.directives
        });
        appendContentWithBoundary(
          bucket,
          repeatAntiphon
            ? normalizeRepeatedAntiphonContent(transformed)
            : openingAntiphon
              ? normalizeOpeningPsalmodyAntiphonContent(
                  transformed,
                  args.hour,
                  args.context.version,
                  ref
                )
              : transformed
        );
        continue;
      }
      if (
        args.slot === 'psalmody' &&
        !isAntiphon &&
        psalmIndex !== undefined &&
        containsInlinePsalmRefs(sourceContent)
      ) {
        appendExpandedPsalmWrapper(bucket, sourceContent, {
          hour: args.hour,
          directives: args.directives,
          context: args.context,
          index: args.corpus,
          language: lang,
          langfb: args.options.langfb,
          seen: new Set(),
          maxDepth: MAX_DEFERRED_DEPTH,
          psalmIndex,
          suppressFirstInlineAntiphon: hasExplicitAntiphon === true,
          suppressTrailingAntiphon: hasExplicitAntiphon === true,
          ...(args.onWarning ? { onWarning: args.onWarning } : {})
        });
        continue;
      }
      const sourceForExpansion = stripTridentineFerialPrecesPsalmBlock(
        args,
        ref,
        prependSimplifiedTriduumOrationPrelude(args, ref, sourceContent)
      );
      const expanded = normalizeResponsoryGloria(
        args,
        expandDeferredNodes(
          args.slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
            ? withPsalmGloriaPatri(sourceForExpansion)
            : sourceForExpansion,
          {
            index: args.corpus,
            language: lang,
            langfb: args.options.langfb,
            season: args.context.season,
            seen: new Set(),
            maxDepth: MAX_DEFERRED_DEPTH,
            ...(args.onWarning ? { onWarning: args.onWarning } : {})
          }
        )
      );
      const flattened = flattenConditionals(expanded, args.context);
      // Directives run before final emission. For psalmody antiphon refs we
      // synthesize the `Ant.` marker first so transforms like `add-alleluia`
      // can target the antiphon line rather than no-op on bare text.
      const directiveInput = isAntiphon ? markAntiphonFirstText(flattened) : flattened;
      const transformed = applyDirectives(args.slot, directiveInput, {
        hour: args.hour,
        directives: args.directives,
        gloriaOmittiturReplacement
      });
      const withHymnDoxology =
        args.slot === 'hymn'
          ? replaceFinalHymnDoxology(transformed, hymnDoxologyByLanguage?.get(lang))
          : transformed;
      const withMajorHourHymnWrapper =
        args.slot === 'hymn'
          ? prependMajorHourHymnWrapper(args, withHymnDoxology, transformed)
          : withHymnDoxology;
      const withTriduumOrationFilter = stripSimplifiedTriduumDismissal(
        args,
        ref,
        withMajorHourHymnWrapper
      );
      // Synthesise the `Ant.` marker the Perl renderer adds at presentation
      // time. Scoped per-ref: whole-antiphon slots (invitatory, canticle
      // antiphons, commemoration antiphons) mark every ref; psalmody marks
      // only its antiphon refs so psalm verses stay unmarked.
      const markered = isAntiphon
        ? repeatAntiphon
          ? normalizeRepeatedAntiphonContent(withMajorHourHymnWrapper)
          : openingAntiphon
            ? normalizeOpeningPsalmodyAntiphonContent(
                withTriduumOrationFilter,
                args.hour,
                args.context.version,
                ref
              )
            : withTriduumOrationFilter
        : withTriduumOrationFilter;
      // Phase 3 §3h — emit a `Psalmus N [index]` heading before each psalm
      // of the psalmody slot (and only for the psalmody slot — Matins
      // psalmody runs through its own composer and gets its headings from
      // `composeMatinsSections`). Perl prints this heading before every
      // psalm at Lauds / Vespers / minor hours; without it the compositor's
      // line stream diverges from the legacy renderer at the first psalm.
      if (args.slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined) {
        const [leadingAntiphon, psalmBody] = splitLeadingPsalmAntiphon(markered);
        if (leadingAntiphon.length > 0) {
          appendContentWithBoundary(
            bucket,
            normalizeOpeningPsalmodyAntiphonContent(
              leadingAntiphon,
              args.hour,
              args.context.version,
              ref
            )
          );
        }
        const heading = buildPsalmHeading(ref, transformed, psalmIndex);
        if (heading) {
          // Route the heading + its trailing separator through
          // `appendContentWithBoundary` so that the preceding psalm's last
          // text node gets a separator between itself and the heading —
          // without that the two text nodes would concatenate into a
          // single line at emit time.
          appendContentWithBoundary(bucket, [
            { type: 'text', value: heading },
            { type: 'separator' }
          ]);
        }
        appendContentWithBoundary(bucket, replaceLeadingCanticleTitleWithCitation(psalmBody));
        continue;
      }
      appendContentWithBoundary(
        bucket,
        args.slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? replaceLeadingCanticleTitleWithCitation(markered)
          : markered
      );
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  return emitSection(args.slot, frozen, primary ? referenceKey(primary) : undefined);
}

function taggedReferencesFrom(
  hour: HourName,
  slot: SlotName,
  content: SlotContent
): readonly TaggedRef[] {
  const wholeAntiphon = isWholeAntiphonSlot(slot);
  switch (content.kind) {
    case 'single-ref':
      return [{ ref: content.ref, isAntiphon: wholeAntiphon }];
    case 'ordered-refs':
      return content.refs.map((ref) => ({ ref, isAntiphon: wholeAntiphon }));
    case 'psalmody': {
      const refs: TaggedRef[] = [];
      const slotWideAntiphonRef = isMinorHour(hour) ? content.psalms[0]?.antiphonRef : undefined;
      if (slotWideAntiphonRef) {
        refs.push({
          ref: slotWideAntiphonRef,
          isAntiphon: true,
          openingAntiphon: true
        });
      }
      for (const [index, assignment] of content.psalms.entries()) {
        if (!slotWideAntiphonRef && assignment.antiphonRef) {
          refs.push({
            ref: assignment.antiphonRef,
            isAntiphon: true
          });
        }
        refs.push({
          ref: assignment.psalmRef,
          isAntiphon: false,
          psalmIndex: index + 1,
          hasExplicitAntiphon: slotWideAntiphonRef
            ? index === 0
            : Boolean(assignment.antiphonRef)
        });
        if (!slotWideAntiphonRef && assignment.antiphonRef) {
          refs.push({
            ref: assignment.antiphonRef,
            isAntiphon: true,
            repeatAntiphon: true
          });
        }
      }
      if (slotWideAntiphonRef) {
        refs.push({
          ref: slotWideAntiphonRef,
          isAntiphon: true,
          repeatAntiphon: true
        });
      }
      return refs;
    }
    case 'empty':
    case 'matins-invitatorium':
    case 'matins-nocturns':
    case 'te-deum':
      return [];
  }

  return [];
}

function prependSimplifiedTriduumOrationPrelude(
  args: ComposeSlotArgs,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!isSimplifiedTriduumOration(args, ref)) {
    return content;
  }

  const prelude = extractTriduumPrayerPrelude(content);
  return prelude.length > 0 ? [...prelude, ...content] : content;
}

function extractTriduumPrayerPrelude(content: readonly TextContent[]): readonly TextContent[] {
  for (const node of content) {
    if (node.type !== 'conditional') {
      continue;
    }

    const psalmIndex = node.content.findIndex((item) => item.type === 'psalmInclude');
    const prelude = node.content.slice(0, psalmIndex >= 0 ? psalmIndex : node.content.length);
    const hasVerse = prelude.some((item) => item.type === 'verseMarker');
    const hasPater = prelude.some(
      (item) => item.type === 'formulaRef' && item.name === 'Pater noster'
    );
    if (!hasVerse || !hasPater) {
      continue;
    }

    let end = prelude.length;
    while (prelude[end - 1]?.type === 'separator') {
      end--;
    }
    return prelude.slice(0, end);
  }

  return [];
}

function stripSimplifiedTriduumDismissal(
  args: ComposeSlotArgs,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (!isSimplifiedTriduumOration(args, ref)) {
    return content;
  }

  return content.filter(
    (node) =>
      !(
        node.type === 'rubric' &&
        node.value.includes('Et dato signo a Superiore omnes surgunt et discedunt.')
      )
  );
}

function stripTridentineFerialPrecesPsalmBlock(
  args: ComposeSlotArgs,
  ref: TextReference,
  content: readonly TextContent[]
): readonly TextContent[] {
  if (
    args.slot !== 'preces' ||
    ref.path !== 'horas/Latin/Psalterium/Special/Preces' ||
    !ref.section.startsWith('Preces feriales') ||
    args.context.version.handle.includes('Trident')
  ) {
    return content;
  }

  const filtered: TextContent[] = [];
  let removing = false;
  let sawPsalm = false;
  for (const node of content) {
    if (!removing && isDomineExaudiNode(node)) {
      removing = true;
      continue;
    }

    if (removing) {
      if (node.type === 'psalmInclude') {
        sawPsalm = true;
      }
      if (sawPsalm && node.type === 'separator') {
        removing = false;
        sawPsalm = false;
      }
      continue;
    }

    filtered.push(node);
  }

  return filtered;
}

function isDomineExaudiNode(node: TextContent): boolean {
  if (node.type === 'formulaRef' && node.name === 'Domine exaudi') {
    return true;
  }
  return node.type === 'conditional' && node.content.some(isDomineExaudiNode);
}

function isSimplifiedTriduumOration(args: ComposeSlotArgs, ref: TextReference): boolean {
  return (
    args.slot === 'oration' &&
    (args.hour === 'lauds' ||
      args.hour === 'vespers' ||
      args.hour === 'prime' ||
      args.hour === 'terce' ||
      args.hour === 'sext' ||
      args.hour === 'none') &&
    args.structure.slots.conclusion?.kind === 'empty' &&
    Boolean(args.context.version.handle.match(/(?:1955|1960)/u)) &&
    (ref.section === 'Oratio' || ref.section === 'Oratio 2') &&
    /\/Tempora\/Quad6-[456]r?$/u.test(ref.path)
  );
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
