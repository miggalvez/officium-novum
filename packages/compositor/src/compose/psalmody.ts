import type { TextContent, TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  HourName,
  HourStructure,
  ResolvedVersion,
  SlotName,
  TextReference
} from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/index.js';
import { flattenConditionals } from '../flatten/index.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import type { ComposeWarning } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';
import { resolveGloriaOmittiturReplacement } from './gloria-omittitur.js';

const PSALMI_MINOR_SUFFIX = '/Psalterium/Psalmi/Psalmi minor';
const GLORIA_PATRI_MACRO: Extract<TextContent, { type: 'macroRef' }> = {
  type: 'macroRef',
  name: 'Gloria'
};

export interface ExpandPsalmWrapperArgs {
  readonly hour: HourName;
  readonly directives: HourStructure['directives'];
  readonly context: ConditionEvalContext;
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly seen: ReadonlySet<string>;
  readonly maxDepth: number;
  readonly psalmIndex: number;
  readonly suppressFirstInlineAntiphon: boolean;
  readonly suppressTrailingAntiphon: boolean;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

/**
 * Build the Perl-compatible `Psalmus N [index]` / `Canticum N [index]`
 * heading line for a psalmody reference. The heading is extracted in
 * priority order:
 *
 *   1. Resolved-content canticle title — e.g. `(Canticum Annæ * ...)`.
 *   2. Direct path match — the reference's `path` ends in `/Psalm<N>`.
 *   3. Selector-embedded psalm number — selectors like `"118(1-16)"`.
 *   4. Resolved-content verse prefix — expanded psalms carry `N:M` prefixes.
 */
export function buildPsalmHeading(
  ref: TextReference,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const selector = ref.selector?.trim();

  const canticleTitle = extractCanticleTitleFromContent(expandedContent);
  if (canticleTitle) {
    return `${canticleTitle} [${psalmIndex}]`;
  }

  const pathMatch = ref.path.match(/\/Psalm(\d+)(?:\.txt)?$/u);
  const directPsalm = pathMatch?.[1];

  const contentPsalm = directPsalm ? undefined : extractPsalmNumberFromContent(expandedContent);
  const psalmNumber = directPsalm ?? contentPsalm;
  if (!psalmNumber) return undefined;

  const tokenRange =
    directPsalm && selector ? selector.match(/^\d+\(([^)]+)\)$/u)?.[1] : undefined;
  const rangeSuffix =
    directPsalm && selector && /^\d+-\d+$/u.test(selector)
      ? `(${normalizePsalmRangeDisplay(selector)})`
      : tokenRange
        ? `(${normalizePsalmRangeDisplay(tokenRange)})`
        : '';
  return `Psalmus ${psalmNumber}${rangeSuffix} [${psalmIndex}]`;
}

function normalizePsalmRangeDisplay(range: string): string {
  return range.replace(/['\s]/gu, '');
}

export function replaceLeadingCanticleTitleWithCitation(
  content: readonly TextContent[],
  selector?: string
): readonly TextContent[] {
  const titleEntry = findLeadingCanticleTitleLine(content);
  if (!titleEntry) return content;

  const { index, node, titleLine } = titleEntry;
  if (titleLine.citation) {
    const citation = applySelectorRangeToCanticleCitation(titleLine.citation, selector);
    const rest = content.slice(index + 1);
    const boundary: TextContent = { type: 'separator' };
    const contentRest = rest[0]?.type === 'separator' ? rest : [boundary, ...rest];
    return [{ ...node, value: citation }, ...contentRest];
  }
  return content.slice(index + 1);
}

export function containsInlinePsalmRefs(content: readonly TextContent[]): boolean {
  return content.some((node) => node.type === 'psalmRef');
}

export function extractInlinePsalmAntiphons(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type === 'psalmRef') {
      const antiphon = node.antiphon?.trim();
      if (antiphon) {
        out.push({ type: 'text', value: antiphon });
      }
      continue;
    }
    out.push(node);
  }
  return out;
}

export function appendExpandedPsalmWrapper(
  target: TextContent[],
  content: readonly TextContent[],
  args: ExpandPsalmWrapperArgs
): void {
  let localPsalmOffset = 0;
  const gloriaOmittiturReplacement = resolveGloriaOmittiturReplacement({
    directives: args.directives,
    corpus: args.index,
    language: args.language,
    langfb: args.langfb,
    context: args.context,
    maxDepth: args.maxDepth,
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  });
  for (const node of content) {
    if (node.type !== 'psalmRef') {
      continue;
    }
    const priorAntiphon = lastStandaloneAntiphonText(target);
    const suppressFirstInlineAntiphon =
      args.suppressFirstInlineAntiphon ||
      (priorAntiphon !== undefined &&
        node.antiphon !== undefined &&
        normalizeRepeatedAntiphonText(priorAntiphon) === normalizeRepeatedAntiphonText(node.antiphon));
    const psalmNode =
      suppressFirstInlineAntiphon && localPsalmOffset === 0 && node.antiphon
        ? { ...node, antiphon: undefined }
        : node;
    const wrappedPsalm = shouldAppendGloriaPatri(psalmNode)
      ? withPsalmGloriaPatri([psalmNode])
      : [psalmNode];
    const expanded = expandDeferredNodes(wrappedPsalm, {
      index: args.index,
      language: args.language,
      langfb: args.langfb,
      season: args.context.season,
      conditionContext: args.context,
      seen: args.seen,
      maxDepth: args.maxDepth,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('psalmody', flattened, {
      hour: args.hour,
      directives: args.directives,
      gloriaOmittiturReplacement
    });
    const [leadingAntiphon, psalmBody] = splitLeadingPsalmAntiphon(transformed);
    if (leadingAntiphon.length > 0) {
      appendContentWithBoundary(target, leadingAntiphon);
    }
    const heading = buildInlinePsalmHeading(node, transformed, args.psalmIndex + localPsalmOffset);
    if (heading) {
      appendContentWithBoundary(target, [
        { type: 'text', value: heading },
        { type: 'separator' }
      ]);
    }
    appendContentWithBoundary(target, replaceLeadingCanticleTitleWithCitation(psalmBody, node.selector));
    const trailingAntiphon =
      args.suppressTrailingAntiphon ? undefined : node.antiphon?.trim();
    if (trailingAntiphon) {
      appendContentWithBoundary(target, [
        {
          type: 'verseMarker',
          marker: 'Ant.',
          text: normalizeRepeatedAntiphonText(trailingAntiphon)
        }
      ]);
    }
    localPsalmOffset += 1;
  }
}

export function withPsalmGloriaPatri(content: readonly TextContent[]): readonly TextContent[] {
  return Object.freeze([...content, GLORIA_PATRI_MACRO]);
}

function shouldAppendGloriaPatri(node: Extract<TextContent, { type: 'psalmRef' }>): boolean {
  // The Benedicite (Psalm210 in the legacy layout) carries its own terminal
  // doxology in-source. The other Lauds Old Testament canticles still receive
  // the normal psalmic Gloria Patri couplet.
  return node.psalmNumber !== 210;
}

export function normalizeRepeatedAntiphonContent(
  content: readonly TextContent[]
): readonly TextContent[] {
  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node) continue;
    if (node.type === 'text') {
      out[index] = {
        type: 'text',
        value: normalizeRepeatedAntiphonText(node.value)
      };
      break;
    }
    if (node.type === 'verseMarker') {
      out[index] = {
        type: 'verseMarker',
        marker: node.marker,
        text: normalizeRepeatedAntiphonText(node.text)
      };
      break;
    }
  }
  return out;
}

export function normalizeRepeatedAntiphonText(text: string): string {
  return text.replace(/\s*;;.*$/u, '').replace(/\s*[*‡†]\s*/gu, ' ').replace(/\s{2,}/gu, ' ').trim();
}

export function normalizeOpeningPsalmodyAntiphonContent(
  content: readonly TextContent[],
  hour: HourName,
  version: ResolvedVersion,
  ref: TextReference
): readonly TextContent[] {
  const shorten = shouldNormalizeOpeningPsalmodyAntiphon(hour, version, ref);
  const ensurePeriod = shouldEnsureTerminalPsalmodyAntiphonPeriod(hour, version, ref);
  if (!shorten && !ensurePeriod) {
    return content;
  }

  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node) continue;
    if (node.type === 'text') {
      out[index] = {
        type: 'text',
        value: finalizeOpeningPsalmodyAntiphonText(node.value, { shorten, ensurePeriod })
      };
      break;
    }
    if (node.type === 'verseMarker') {
      out[index] = {
        type: 'verseMarker',
        marker: node.marker,
        text: finalizeOpeningPsalmodyAntiphonText(node.text, { shorten, ensurePeriod })
      };
      break;
    }
  }
  return out;
}

export function isMinorHour(hour: SlotName | HourName): hour is 'prime' | 'terce' | 'sext' | 'none' {
  return hour === 'prime' || hour === 'terce' || hour === 'sext' || hour === 'none';
}

function buildInlinePsalmHeading(
  node: Extract<TextContent, { type: 'psalmRef' }>,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const canticleTitle = extractCanticleTitleFromContent(expandedContent);
  if (canticleTitle) {
    return `${canticleTitle} [${psalmIndex}]`;
  }

  const inlinePsalmNumber =
    Number.isFinite(node.psalmNumber) && node.psalmNumber > 0 ? String(node.psalmNumber) : undefined;
  const psalmNumber = inlinePsalmNumber ?? extractPsalmNumberFromContent(expandedContent);
  if (!psalmNumber) {
    return undefined;
  }
  const tokenRange = node.selector?.trim().match(/^\d+\(([^)]+)\)$/u)?.[1];
  const rangeSuffix = tokenRange ? `(${normalizePsalmRangeDisplay(tokenRange)})` : '';
  return `Psalmus ${psalmNumber}${rangeSuffix} [${psalmIndex}]`;
}

function extractCanticleTitleFromContent(content: readonly TextContent[]): string | undefined {
  return findLeadingCanticleTitleLine(content)?.titleLine.title;
}

function findLeadingCanticleTitleLine(
  content: readonly TextContent[]
): LeadingCanticleTitleLine | undefined {
  for (let index = 0; index < content.length; index += 1) {
    const node = content[index];
    if (!node || node.type !== 'text') continue;
    const titleLine = parseCanticleTitleLine(node.value);
    if (titleLine) return { index, node, titleLine };
    if (node.value.trim().length > 0) return undefined;
  }
  return undefined;
}

interface CanticleTitleLine {
  readonly title: string;
  readonly citation?: string;
}

interface LeadingCanticleTitleLine {
  readonly index: number;
  readonly node: Extract<TextContent, { type: 'text' }>;
  readonly titleLine: CanticleTitleLine;
}

function parseCanticleTitleLine(text: string): CanticleTitleLine | undefined {
  const match = text.match(
    /^\s*\(((?:Canticum|Canticle of)[^*)]*?)(?:\s*\*\s*([^)]+))?\)\s*$/u
  );
  const title = match?.[1]?.replace(/\s+/gu, ' ').trim();
  if (!title) return undefined;
  const citation = match?.[2]?.replace(/\s+/gu, ' ').trim();
  return citation ? { title, citation } : { title };
}

function applySelectorRangeToCanticleCitation(citation: string, selector?: string): string {
  const range = selector?.trim().match(/^\d+\(([^)]+)\)$/u)?.[1];
  if (!range) return citation;

  const normalizedRange = normalizePsalmRangeDisplay(range);
  const match = citation.match(/^(.*?:)\s*[\dA-Za-z]+(?:\s*-\s*[\dA-Za-z]+)?$/u);
  if (!match) return citation;
  return `${match[1]}${normalizedRange}`;
}

export function splitLeadingPsalmAntiphon(
  content: readonly TextContent[]
): readonly [readonly TextContent[], readonly TextContent[]] {
  const first = content[0];
  if (first?.type === 'verseMarker' && first.marker === 'Ant.') {
    return [content.slice(0, 1), content.slice(1)];
  }
  return [[], content];
}

function extractPsalmNumberFromContent(
  content: readonly TextContent[]
): string | undefined {
  for (const node of content) {
    if (node.type !== 'text') continue;
    const match = node.value.match(/^\s*(\d+):\d+/u);
    if (match) return match[1];
  }
  return undefined;
}

function lastStandaloneAntiphonText(content: readonly TextContent[]): string | undefined {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index];
    if (!node || node.type === 'separator') {
      continue;
    }
    return node.type === 'verseMarker' && node.marker === 'Ant.' ? node.text : undefined;
  }
  return undefined;
}

function shouldNormalizeOpeningPsalmodyAntiphon(
  hour: HourName,
  version: ResolvedVersion,
  ref: TextReference
): boolean {
  if (!isMinorHour(hour) || version.handle.includes('1960')) {
    return false;
  }

  if (!ref.path.endsWith(PSALMI_MINOR_SUFFIX)) {
    return true;
  }

  return hour === 'prime' || isWeekdayMinorPsalmiMinorRef(ref);
}

function shouldEnsureTerminalPsalmodyAntiphonPeriod(
  hour: HourName,
  version: ResolvedVersion,
  ref: TextReference
): boolean {
  return (
    hour === 'lauds' &&
    version.handle.includes('1960') &&
    ref.path.endsWith(PSALMI_MINOR_SUFFIX) &&
    ref.section === 'Tridentinum' &&
    ref.selector === 'Prima Festis#antiphon'
  );
}

function finalizeOpeningPsalmodyAntiphonText(
  text: string,
  options: { readonly shorten: boolean; readonly ensurePeriod: boolean }
): string {
  const normalized = options.shorten ? normalizeOpeningPsalmodyAntiphonText(text) : text.trim();
  return options.ensurePeriod ? ensureTerminalPeriod(normalized) : normalized;
}

function ensureTerminalPeriod(text: string): string {
  if (!text || /[.!?]$/u.test(text)) {
    return text;
  }
  return `${text}.`;
}

function normalizeOpeningPsalmodyAntiphonText(text: string): string {
  const match = text.match(/^(.*?)(?:\s*[*‡†]\s*)(.+)$/u);
  if (!match) {
    return text;
  }

  const prefix = match[1]?.trim();
  if (!prefix) {
    return text;
  }

  if (/[.:!?]$/u.test(prefix)) {
    return prefix;
  }

  return `${prefix.replace(/[;,]\s*$/u, '').trim()}.`;
}

function isWeekdayMinorPsalmiMinorRef(ref: TextReference): boolean {
  return (
    (ref.section === 'Prima' ||
      ref.section === 'Tertia' ||
      ref.section === 'Sexta' ||
      ref.section === 'Nona') &&
    Boolean(ref.selector?.match(/^Feria\s+(?:II|III|IV|V|VI|VII)(?:#antiphon)?$/u))
  );
}
