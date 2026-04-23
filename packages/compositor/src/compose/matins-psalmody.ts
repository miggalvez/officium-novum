import { ensureTxtSuffix, type TextContent, type TextIndex } from '@officium-novum/parser';
import type {
  ConditionEvalContext,
  HourDirective,
  TextReference
} from '@officium-novum/rubrical-engine';

import { applyDirectives } from '../directives/apply-directives.js';
import { flattenConditionals } from '../flatten/evaluate-conditionals.js';
import { expandDeferredNodes } from '../resolve/expand-deferred-nodes.js';
import { resolveReference } from '../resolve/reference-resolver.js';
import type { ComposeOptions, ComposeWarning } from '../types/composed-hour.js';
import { appendContentWithBoundary } from './content-boundary.js';
import { resolveGloriaOmittiturReplacement } from './gloria-omittitur.js';

const MAX_DEFERRED_DEPTH = 8;
const GLORIA_PATRI_MACRO: Extract<TextContent, { type: 'macroRef' }> = {
  type: 'macroRef',
  name: 'Gloria'
};

type OpeningAntiphonMode =
  | { readonly kind: 'full' }
  | { readonly kind: 'short'; readonly prefix: string }
  | { readonly kind: 'short-with-continuation'; readonly prefix: string };

export interface MatinsPsalmodyContext {
  readonly corpus: TextIndex;
  readonly options: ComposeOptions;
  readonly directives: readonly HourDirective[];
  readonly context: ConditionEvalContext;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

export interface ExpandMatinsPsalmWrapperArgs {
  readonly directives: readonly HourDirective[];
  readonly context: ConditionEvalContext;
  readonly index: TextIndex;
  readonly language: string;
  readonly langfb?: string;
  readonly maxDepth: number;
  readonly psalmIndex: number;
  readonly suppressFirstInlineAntiphon: boolean;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

interface PsalmVerseBoundary {
  readonly number: number;
  readonly suffix?: string;
}

export function buildPsalmHeading(
  ref: TextReference,
  expandedContent: readonly TextContent[],
  psalmIndex: number,
  pairedAntiphonRef: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): string | undefined {
  const selector = ref.selector?.trim();

  const pathMatch = ref.path.match(/\/Psalm(\d+)(?:\.txt)?$/u);
  const directPsalm = pathMatch?.[1];

  const contentPsalm = directPsalm ? undefined : extractPsalmNumberFromContent(expandedContent);
  const psalmNumber = directPsalm ?? contentPsalm;
  if (!psalmNumber) return undefined;

  const rangeSuffix =
    directPsalm && selector && /^\d+-\d+$/u.test(selector)
      ? `(${selector})`
      : resolvePairedAntiphonRange(pairedAntiphonRef, language, args);
  return `Psalmus ${psalmNumber}${rangeSuffix} [${psalmIndex}]`;
}

export function containsInlinePsalmRefs(content: readonly TextContent[]): boolean {
  return content.some((node) => node.type === 'psalmRef');
}

export function extractInlinePsalmAntiphons(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type === 'psalmRef') {
      const antiphon = sanitizeAntiphonText(node.antiphon);
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
  args: ExpandMatinsPsalmWrapperArgs
): void {
  let localPsalmOffset = 0;
  const suppressFirstInlineAntiphon =
    args.suppressFirstInlineAntiphon || endsWithStandaloneAntiphon(target);
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
    const psalmNode =
      suppressFirstInlineAntiphon && localPsalmOffset === 0 && node.antiphon
        ? { ...node, antiphon: undefined }
        : node;
    const expanded = expandDeferredNodes(withPsalmGloriaPatri([psalmNode]), {
      index: args.index,
      language: args.language,
      langfb: args.langfb,
      season: args.context.season,
      seen: new Set(),
      maxDepth: args.maxDepth,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    });
    const flattened = flattenConditionals(expanded, args.context);
    const transformed = applyDirectives('psalmody', flattened, {
      hour: 'matins',
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
    appendContentWithBoundary(target, psalmBody);
    const trailingAntiphon = sanitizeAntiphonText(node.antiphon);
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

export function normalizeOpeningAntiphonContent(
  content: readonly TextContent[],
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): readonly TextContent[] {
  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node || (node.type !== 'text' && node.type !== 'verseMarker')) {
      continue;
    }
    const sanitized = sanitizeAntiphonText(node.type === 'text' ? node.value : node.text);
    if (!sanitized) {
      break;
    }
    const normalized = normalizeOpeningAntiphonText(sanitized, antiphonRef, pairedPsalmRef, language, args);
    out[index] =
      node.type === 'text'
        ? { type: 'text', value: normalized }
        : { type: 'verseMarker', marker: node.marker, text: normalized };
    break;
  }
  return out;
}

export function normalizeOpeningPsalmBodyContent(
  content: readonly TextContent[],
  pairedAntiphonRef: TextReference | undefined,
  psalmRef: TextReference,
  language: string,
  args: MatinsPsalmodyContext
): readonly TextContent[] {
  if (!pairedAntiphonRef) {
    return content;
  }

  const openingText = resolveOpeningAntiphonSourceText(pairedAntiphonRef, language, args);
  if (!openingText) {
    return content;
  }

  const mode = determineOpeningAntiphonMode(openingText, pairedAntiphonRef, psalmRef, language, args);
  if (mode.kind !== 'short-with-continuation') {
    return content;
  }

  const out = [...content];
  for (let index = 0; index < out.length; index += 1) {
    const node = out[index];
    if (!node || node.type !== 'text' || !/^\s*\d+:\d+/u.test(node.value)) {
      continue;
    }
    out[index] = {
      type: 'text',
      value: insertFirstVerseContinuationMarker(node.value, mode.prefix)
    };
    break;
  }
  return out;
}

export function extendPsalterMatinsVersicleContent(
  content: readonly TextContent[],
  ref: TextReference,
  language: string,
  args: MatinsPsalmodyContext
): readonly TextContent[] {
  if (
    ref.path !== 'horas/Latin/Psalterium/Psalmi/Psalmi matutinum' ||
    ref.section !== 'Day0' ||
    !ref.selector ||
    !/^\d+$/u.test(ref.selector)
  ) {
    return content;
  }

  const hasResponse = content.some(
    (node) => node.type === 'verseMarker' && (node.marker === 'R.' || node.marker === 'r.')
  );
  if (hasResponse) {
    return content;
  }

  const nextSelector = String(Number.parseInt(ref.selector, 10) + 1);
  const nextSection = resolveReference(args.corpus, { ...ref, selector: nextSelector }, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!nextSection || nextSection.selectorMissing) {
    return content;
  }

  const responseNodes = nextSection.content.filter(
    (node) => node.type === 'verseMarker' && (node.marker === 'R.' || node.marker === 'r.')
  );
  return responseNodes.length > 0 ? Object.freeze([...content, ...responseNodes]) : content;
}

export function slicePsalmContentByVerseRange(
  content: readonly TextContent[],
  range: string
): readonly TextContent[] {
  const match = /^\s*(\d+[a-z]?)\s*-\s*(\d+[a-z]?)\s*$/iu.exec(range);
  if (!match?.[1] || !match[2]) {
    return content;
  }

  const start = parsePsalmVerseBoundary(match[1]);
  const end = parsePsalmVerseBoundary(match[2]);
  if (start === undefined || end === undefined || comparePsalmVerseBoundary(start, end) > 0) {
    return content;
  }

  const out: TextContent[] = [];
  for (const node of content) {
    if (node.type !== 'text') {
      out.push(node);
      continue;
    }

    const verse = parsePsalmVerseLabel(node.value);
    if (!verse) {
      out.push(node);
      continue;
    }

    if (comparePsalmVerseBoundary(verse, start) >= 0 && comparePsalmVerseBoundary(verse, end) <= 0) {
      out.push(node);
    }
  }

  return out;
}

export function resolvePairedAntiphonRangeValue(
  ref: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): string {
  if (!ref) {
    return '';
  }

  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return '';
  }

  for (const node of section.content) {
    if (node.type === 'psalmRef') {
      const range = extractInlinePsalmRange(node.antiphon);
      if (range) {
        return range;
      }
    }
    if (node.type === 'text') {
      const range = extractInlinePsalmRange(node.value);
      if (range) {
        return range;
      }
    }
  }

  return '';
}

export function separatePsalmVerseLines(content: readonly TextContent[]): readonly TextContent[] {
  const out: TextContent[] = [];
  for (const node of content) {
    if (startsPsalmVerse(node) && out.length > 0 && out[out.length - 1]?.type !== 'separator') {
      out.push({ type: 'separator' });
    }
    out.push(node);
  }
  return out;
}

function buildInlinePsalmHeading(
  node: Extract<TextContent, { type: 'psalmRef' }>,
  expandedContent: readonly TextContent[],
  psalmIndex: number
): string | undefined {
  const inlinePsalmNumber =
    Number.isFinite(node.psalmNumber) && node.psalmNumber > 0 ? String(node.psalmNumber) : undefined;
  const psalmNumber = inlinePsalmNumber ?? extractPsalmNumberFromContent(expandedContent);
  if (!psalmNumber) {
    return undefined;
  }
  const rangeSuffix = extractInlinePsalmRange(node.antiphon);
  return `Psalmus ${psalmNumber}${rangeSuffix ? `(${rangeSuffix})` : ''} [${psalmIndex}]`;
}

function splitLeadingPsalmAntiphon(
  content: readonly TextContent[]
): readonly [readonly TextContent[], readonly TextContent[]] {
  const first = content[0];
  if (first?.type === 'verseMarker' && first.marker === 'Ant.') {
    return [content.slice(0, 1), content.slice(1)];
  }
  return [[], content];
}

function endsWithStandaloneAntiphon(content: readonly TextContent[]): boolean {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index];
    if (!node || node.type === 'separator') {
      continue;
    }
    return node.type === 'verseMarker' && node.marker === 'Ant.';
  }
  return false;
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

function normalizeRepeatedAntiphonText(text: string): string {
  return sanitizeAntiphonText(text)
    ?.replace(/\s*[*‡†]\s*/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim() ?? '';
}

function normalizeOpeningAntiphonText(
  text: string,
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): string {
  const mode = determineOpeningAntiphonMode(text, antiphonRef, pairedPsalmRef, language, args);
  switch (mode.kind) {
    case 'full':
      return text;
    case 'short':
      return `${mode.prefix}.`;
    case 'short-with-continuation':
      return `${mode.prefix}. ‡`;
  }
}

function determineOpeningAntiphonMode(
  text: string,
  antiphonRef: TextReference,
  pairedPsalmRef: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): OpeningAntiphonMode {
  if (args.context.version.handle.includes('1960') || !isPsalterMatinsAntiphonRef(antiphonRef)) {
    return { kind: 'full' };
  }

  const match = text.match(/^(.*?)(?:\s*[*‡†]\s*)(.+)$/u);
  if (!match) {
    return { kind: 'full' };
  }

  const prefix = match[1]?.replace(/[.,;:]+\s*$/u, '').trim();
  if (!prefix) {
    return { kind: 'full' };
  }

  const firstVerse = pairedPsalmRef
    ? resolveFirstPsalmVerseText(pairedPsalmRef, language, args)
    : undefined;
  const needsContinuationMarker =
    firstVerse !== undefined &&
    canonicalizePsalmComparisonText(firstVerse).startsWith(canonicalizePsalmComparisonText(prefix));

  return needsContinuationMarker
    ? { kind: 'short-with-continuation', prefix }
    : { kind: 'short', prefix };
}

function isPsalterMatinsAntiphonRef(ref: TextReference): boolean {
  return /\/Psalterium\/Psalmi\//u.test(ensureTxtSuffix(ref.path));
}

function resolveOpeningAntiphonSourceText(
  ref: TextReference,
  language: string,
  args: MatinsPsalmodyContext
): string | undefined {
  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return undefined;
  }

  for (const node of section.content) {
    if (node.type === 'psalmRef') {
      return sanitizeAntiphonText(node.antiphon);
    }
    if (node.type === 'text') {
      return sanitizeAntiphonText(node.value);
    }
    if (node.type === 'verseMarker') {
      return sanitizeAntiphonText(node.text);
    }
  }

  return undefined;
}

function insertFirstVerseContinuationMarker(text: string, prefix: string): string {
  if (text.includes('‡')) {
    return text;
  }

  const match = text.match(
    new RegExp(`^(\\s*\\d+:\\d+\\s*)(${escapeRegExp(prefix)})([.,;:]?)(\\s+)(.+)$`, 'u')
  );
  if (!match) {
    return text;
  }

  const [, lead = '', matchedPrefix = '', punctuation = '', spacing = ' ', remainder = ''] = match;
  return `${lead}${matchedPrefix}${punctuation} ‡${spacing}${remainder}`;
}

function sanitizeAntiphonText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/\s*;;.*$/u, '').trim();
}

function extractInlinePsalmRange(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(/;;\s*\d+\(([^)]+)\)\s*$/u);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/['"]/gu, '').replace(/\s*-\s*/gu, '-').trim();
}

function parsePsalmVerseBoundary(boundary: string): PsalmVerseBoundary | undefined {
  const match = /^\s*(\d+)([a-z])?/iu.exec(boundary);
  if (!match?.[1]) {
    return undefined;
  }

  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const suffix = match[2]?.toLowerCase();
  return suffix ? { number: value, suffix } : { number: value };
}

function parsePsalmVerseLabel(line: string): PsalmVerseBoundary | undefined {
  const match = /^\s*\d+:(\d+[a-z]?)/iu.exec(line);
  return match?.[1] ? parsePsalmVerseBoundary(match[1]) : undefined;
}

function comparePsalmVerseBoundary(left: PsalmVerseBoundary, right: PsalmVerseBoundary): number {
  if (left.number !== right.number) {
    return left.number - right.number;
  }
  return suffixRank(left.suffix) - suffixRank(right.suffix);
}

function suffixRank(suffix: string | undefined): number {
  if (!suffix) {
    return 0;
  }
  const charCode = suffix.charCodeAt(0);
  return Number.isFinite(charCode) ? charCode : 0;
}

function resolvePairedAntiphonRange(
  ref: TextReference | undefined,
  language: string,
  args: MatinsPsalmodyContext
): string {
  const range = resolvePairedAntiphonRangeValue(ref, language, args);
  return range ? `(${range})` : '';
}

function resolveFirstPsalmVerseText(
  ref: TextReference,
  language: string,
  args: MatinsPsalmodyContext
): string | undefined {
  const section = resolveReference(args.corpus, ref, {
    languages: [language],
    langfb: args.options.langfb,
    dayOfWeek: args.context.dayOfWeek,
    date: args.context.date,
    season: args.context.season,
    version: args.context.version,
    modernStyleMonthday: args.context.version.handle.includes('1960'),
    ...(args.onWarning ? { onWarning: args.onWarning } : {})
  })[language];
  if (!section || section.selectorMissing) {
    return undefined;
  }

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
  const transformed = applyDirectives('psalmody', flattened, {
    hour: 'matins',
    directives: args.directives,
    gloriaOmittiturReplacement: resolveGloriaOmittiturReplacement({
      directives: args.directives,
      corpus: args.corpus,
      language,
      langfb: args.options.langfb,
      context: args.context,
      maxDepth: MAX_DEFERRED_DEPTH,
      ...(args.onWarning ? { onWarning: args.onWarning } : {})
    })
  });

  for (const node of transformed) {
    if (node.type === 'text' && /^\s*\d+:\d+/u.test(node.value)) {
      return node.value;
    }
  }

  return undefined;
}

function canonicalizePsalmComparisonText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^\s*\d+:\d+\s*/u, '')
    .replace(/[.,;:!?*‡†]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function startsPsalmVerse(node: TextContent): boolean {
  if (node.type === 'text') {
    return /^\s*\d+:\d+/u.test(node.value);
  }
  if (node.type === 'verseMarker') {
    return true;
  }
  return false;
}
