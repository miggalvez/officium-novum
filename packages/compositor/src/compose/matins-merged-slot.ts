import type { TextContent } from '@officium-novum/parser';
import type { PsalmAssignment, TextReference } from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/apply-directives.js';
import { isWholeAntiphonSlot, markAntiphonFirstText } from '../emit/antiphon-marker.js';
import { emitSection } from '../emit/sections.js';
import { flattenConditionals } from '../flatten/evaluate-conditionals.js';
import { expandDeferredNodes, interleaveSeparators } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { Section } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';
import { resolveGloriaOmittiturReplacement } from './gloria-omittitur.js';
import { replaceFinalHymnDoxology } from './major-hour-hymn.js';
import type { MatinsComposeContext } from './matins-shared.js';
import { referenceIdentity } from './matins-shared.js';
import { normalizeResponsoryGloria } from './responsory-gloria.js';
import {
  appendExpandedPsalmWrapper,
  buildPsalmHeading,
  containsInlinePsalmRefs,
  extendPsalterMatinsVersicleContent,
  extractInlinePsalmAntiphons,
  materializePairedAntiphonPlaceholders,
  normalizeOpeningAntiphonContent,
  normalizeOpeningPsalmBodyContent,
  normalizeRepeatedAntiphonContent,
  resolvePairedAntiphonRangeValue,
  separatePsalmVerseLines,
  slicePsalmContentByVerseRange,
  withPsalmGloriaPatri
} from './matins-psalmody.js';
import { MAX_DEFERRED_DEPTH } from './shared.js';

export interface MatinsSlotRef {
  readonly ref: TextReference;
  readonly isAntiphon: boolean;
  readonly openingAntiphon?: boolean;
  readonly repeatAntiphon?: boolean;
  readonly appendGloria?: boolean;
  readonly hasExplicitAntiphon?: boolean;
  readonly pairedAntiphonRef?: TextReference;
  readonly pairedPsalmRef?: TextReference;
  readonly psalmIndex?: number;
}

export function composeReferenceSlot(
  slot: Parameters<typeof emitSection>[0],
  ref: TextReference,
  args: MatinsComposeContext,
  hymnDoxology?: ReadonlyMap<string, readonly TextContent[]>,
  options: Partial<Omit<MatinsSlotRef, 'ref' | 'isAntiphon'>> = {}
): Section | undefined {
  return composeMergedSlot(
    slot,
    [{ ref, isAntiphon: isWholeAntiphonSlot(slot), ...options }],
    args,
    hymnDoxology
  );
}

export function composeMergedSlot(
  slot: Parameters<typeof emitSection>[0],
  refs: readonly MatinsSlotRef[],
  args: MatinsComposeContext,
  hymnDoxology?: ReadonlyMap<string, readonly TextContent[]>
): Section | undefined {
  if (refs.length === 0) return undefined;
  const perLanguage = new Map<string, TextContent[]>();
  for (const lang of args.options.languages) {
    perLanguage.set(lang, []);
  }

  for (const refState of refs) {
    const {
      ref,
      isAntiphon,
      openingAntiphon,
      psalmIndex,
      hasExplicitAntiphon,
      repeatAntiphon,
      appendGloria,
      pairedAntiphonRef,
      pairedPsalmRef
    } = refState;
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
        slot === 'psalmody'
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
        bucket.push({
          type: 'rubric',
          value: `(Section missing: ${ref.section})`
        });
        continue;
      }
      const sourceContent =
        slot === 'versicle'
          ? extendPsalterMatinsVersicleContent(section.content, ref, lang, args)
          : appendGloria === true && slot === 'responsory'
            ? withResponsoryGloria(section.content)
            : section.content;
      if (slot === 'psalmody' && isAntiphon && containsInlinePsalmRefs(sourceContent)) {
        const antiphonOnly = extractInlinePsalmAntiphons(sourceContent);
        const flattened = flattenConditionals(antiphonOnly, args.context);
        const transformed = applyDirectives(slot, flattened, {
          hour: 'matins',
          language: lang,
          directives: args.directives,
          gloriaOmittiturReplacement
        });
        const normalized = repeatAntiphon
          ? normalizeRepeatedAntiphonContent(transformed)
          : openingAntiphon
            ? normalizeOpeningAntiphonContent(transformed, ref, pairedPsalmRef, lang, args)
            : transformed;
        appendContentWithBoundary(bucket, markAntiphonFirstText(normalized));
        continue;
      }
      if (
        slot === 'psalmody' &&
        !isAntiphon &&
        psalmIndex !== undefined &&
        containsInlinePsalmRefs(sourceContent)
      ) {
        appendExpandedPsalmWrapper(bucket, sourceContent, {
          directives: args.directives,
          context: args.context,
          index: args.corpus,
          language: lang,
          langfb: args.options.langfb,
          maxDepth: MAX_DEFERRED_DEPTH,
          psalmIndex,
          suppressFirstInlineAntiphon: hasExplicitAntiphon === true,
          ...(args.onWarning ? { onWarning: args.onWarning } : {})
        });
        continue;
      }
      const lessonSourceContent =
        slot === 'lectio-brevis' ? stripEmbeddedTeDeumMacro(sourceContent) : sourceContent;
      const expandedContent = expandDeferredNodes(
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? withPsalmGloriaPatri(lessonSourceContent)
          : lessonSourceContent,
        {
          index: args.corpus,
          language: lang,
          langfb: args.options.langfb,
          season: args.context.season,
          conditionContext: args.context,
          seen: new Set(),
          maxDepth: MAX_DEFERRED_DEPTH,
          ...(args.onWarning ? { onWarning: args.onWarning } : {})
        }
      );
      const expanded = slot === 'responsory' ? normalizeResponsoryGloria(expandedContent) : expandedContent;
      const flattened = flattenConditionals(expanded, args.context);
      const transformed = applyDirectives(slot, flattened, {
        hour: 'matins',
        language: lang,
        directives: args.directives,
        gloriaOmittiturReplacement
      });
      const withPairedAntiphonPlaceholders =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? materializePairedAntiphonPlaceholders(
              transformed,
              pairedAntiphonRef,
              lang,
              args
            )
          : transformed;
      const withDoxology =
        slot === 'hymn'
          ? replaceFinalHymnDoxology(withPairedAntiphonPlaceholders, hymnDoxology?.get(lang))
          : withPairedAntiphonPlaceholders;
      const withLiturgicalLineBreaks =
        slot === 'lectio-brevis' || slot === 'te-deum'
          ? interleaveSeparators(withDoxology)
          : withDoxology;
      const lineSeparated =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? separatePsalmVerseLines(withLiturgicalLineBreaks)
          : withLiturgicalLineBreaks;
      const rangedPsalmBody =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? slicePsalmContentByVerseRange(
              lineSeparated,
              resolvePairedAntiphonRangeValue(pairedAntiphonRef, lang, args)
            )
          : lineSeparated;
      const normalizedPsalmBody =
        slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined
          ? normalizeOpeningPsalmBodyContent(rangedPsalmBody, pairedAntiphonRef, ref, lang, args)
          : rangedPsalmBody;
      // Same `Ant.` marker synthesis as the generic composeSlot; see
      // `emit/antiphon-marker.ts`. For Matins this covers the invitatory,
      // the nocturn antiphons inside `psalmody`, and any unpaired
      // antiphons surfaced as standalone sections.
      const markered = isAntiphon
        ? markAntiphonFirstText(
            repeatAntiphon
              ? normalizeRepeatedAntiphonContent(lineSeparated)
              : openingAntiphon
                ? normalizeOpeningAntiphonContent(lineSeparated, ref, pairedPsalmRef, lang, args)
                : lineSeparated
          )
        : normalizedPsalmBody;
      if (slot === 'psalmody' && !isAntiphon && psalmIndex !== undefined) {
        const heading = buildPsalmHeading(
          ref,
          normalizedPsalmBody,
          psalmIndex,
          pairedAntiphonRef,
          lang,
          args
        );
        if (heading) {
          appendContentWithBoundary(bucket, [
            { type: 'text', value: heading },
            { type: 'separator' }
          ]);
        }
      }
      appendContentWithBoundary(bucket, markered);
    }
  }

  const frozen = new Map<string, readonly TextContent[]>();
  for (const [lang, nodes] of perLanguage) {
    if (nodes.length > 0) frozen.set(lang, Object.freeze(nodes));
  }
  if (frozen.size === 0) return undefined;

  const primary = refs[0]!.ref;
  return emitSection(slot, frozen, referenceIdentity(primary));
}

function withResponsoryGloria(content: readonly TextContent[]): readonly TextContent[] {
  if (containsGloriaMacro(content)) {
    return content;
  }

  const repeatedResponse = findLastResponsoryResponse(content);
  return Object.freeze([
    ...content,
    { type: 'macroRef', name: 'Gloria1' } satisfies TextContent,
    ...(repeatedResponse ? [repeatedResponse] : [])
  ]);
}

function containsGloriaMacro(content: readonly TextContent[]): boolean {
  return content.some((node) => {
    if (node.type === 'macroRef') {
      return node.name.toLowerCase() === 'gloria';
    }
    if (node.type === 'conditional') {
      return containsGloriaMacro(node.content);
    }
    return false;
  });
}

function stripEmbeddedTeDeumMacro(content: readonly TextContent[]): readonly TextContent[] {
  const filtered = content.filter(
    (node) => node.type !== 'macroRef' || !/^te\s*deum$/iu.test(node.name)
  );
  return filtered.length === content.length ? content : Object.freeze(filtered);
}

function findLastResponsoryResponse(
  content: readonly TextContent[]
): Extract<TextContent, { type: 'verseMarker' }> | undefined {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index]!;
    if (node.type === 'verseMarker' && /^r\.?$/iu.test(node.marker.trim())) {
      return {
        type: 'verseMarker',
        marker: node.marker,
        text: node.text
      };
    }
    if (node.type === 'conditional') {
      const nested = findLastResponsoryResponse(node.content);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}
