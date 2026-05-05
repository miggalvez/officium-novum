import {
  ensureTxtSuffix,
  extractSyntheticHeadingSections,
  languageFallbackChain,
  type ParsedSection,
  type TextContent,
  type TextIndex
} from '@officium-novum/parser';
import { conditionMatches, type ConditionEvalContext, type TextReference } from '@officium-novum/rubrical-engine';

import type { ComposeWarning } from '../types/composed-hour.js';
import {
  isKeyedPsalterSection,
  isWeekdayKey,
  selectKeyedTextContent
} from './keyed-content.js';
import {
  materializeInvitatoryContent,
  resolveInvitatoryAntiphonContent,
  resolveSeasonalInvitatorium
} from './invitatory.js';
import { expandPsalmTokenList, resolveMinorHourPsalmody } from './minor-hour-psalmody.js';
import { swapLanguageSegment } from './path.js';
import { resolveLocalizedSourceFallback } from './localized-source-fallback.js';
import { synthesizeSection } from './synthetic-sections.js';

export {
  materializeInvitatoryContent,
  type InvitatoryMaterializationMode,
  resolveInvitatoryAntiphonContent
} from './invitatory.js';
export { swapLanguageSegment } from './path.js';

export interface ResolvedSection {
  readonly language: string;
  readonly path: string;
  readonly section: ParsedSection;
  /**
   * When a `selector` is present on the {@link TextReference} and the
   * selector has a semantics the resolver understands, the original section
   * content is narrowed to the selected subset.
   */
  readonly content: readonly TextContent[];
  /**
   * `true` when a `selector` was present but the resolver did not apply any
   * narrowing — either because the selector had semantics the resolver does
   * not yet implement or because the selector was `'missing'`. Callers can
   * use this to surface a warning / placeholder rather than silently
   * returning the whole section.
   */
  readonly selectorUnhandled: boolean;
  /**
   * `true` when the selector was `'missing'` — Phase 2's sentinel for "this
   * slot is intentionally empty because the source section does not exist."
   */
  readonly selectorMissing: boolean;
}

export interface ResolveOptions {
  readonly languages: readonly string[];
  readonly langfb?: string;
  readonly dayOfWeek?: number;
  readonly date?: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
  };
  readonly season?: ConditionEvalContext['season'];
  readonly version?: ConditionEvalContext['version'];
  /**
   * Mirrors the Perl `monthday(..., $modernstyle, ...)` switch used by the
   * ordinary Sunday invitatory selector. `true` for the 1960 family, `false`
   * for older Roman families.
   */
  readonly modernStyleMonthday?: boolean;
  /**
   * Optional callback for compose-time warnings. Per Phase 3 §3f and
   * ADR-011 the resolver no longer silently returns `undefined` when a
   * reference fails to resolve or a selector is not understood — instead
   * it records a {@link ComposeWarning} via this sink and returns the
   * best-effort result. Callers (compose.ts, compose/matins.ts) collect
   * the warnings and surface them on {@link ComposedHour.warnings}.
   */
  readonly onWarning?: (warning: ComposeWarning) => void;
}

/**
 * Resolve a {@link TextReference} (Latin-rooted, as emitted by Phase 2) to a
 * {@link ParsedSection} per requested language. Walks the parser's standard
 * language-fallback chain when the requested language lacks the file.
 *
 * When `reference.selector` is present, the resolver narrows the section
 * content according to the selector's semantics:
 *
 *   - **Integer selector** (`"1"`, `"2"`, …) — picks the Nth content node
 *     (1-based) from the section. When a section is composed entirely of
 *     conditional alternatives, the selector descends through the wrappers and
 *     preserves the condition tree while narrowing each branch to its Nth
 *     child. Emitted by Phase 2 when Matins line-picks antiphons, versicles,
 *     and benedictions from the psalterium (`matins-plan.ts`
 *     lines 265, 351).
 *   - **`'missing'` sentinel** — Phase 2's placeholder for "section not
 *     found." The resolver preserves the full section content but sets
 *     {@link ResolvedSection.selectorMissing} so callers can surface a
 *     rubric warning instead of rendering stale text.
 *   - **Psalm-selector lists** (`"62,66"`, `"116"`) on
 *     `Psalterium/Psalmorum/PsalmN` — expand to the referenced psalm file(s),
 *     including verse-range tokens like `118(1-16)`.
 *   - **Weekday keys** (`Dominica`, `Feria II`, ...) on
 *     `Psalterium/Psalmi/Psalmi minor` — select the keyed entry for the
 *     requested weekday and expand its psalm list.
 *   - **Season keys** (`Adventus`, `Pascha`, ...) on `Invitatorium.txt` —
 *     inject the season's invitatory antiphon into the fixed Psalm 94
 *     skeleton using the current day of week where the special file is
 *     weekday-keyed.
 *   - **Heading-backed synthetic sections** on files such as
 *     `horas/Ordinarium/*.txt` — when a named section is absent but the file
 *     exposes a `__preamble` with `#Heading` markers, the resolver slices the
 *     content between matching headings and returns it as a synthetic section.
 *
 * Returns `undefined` for a language when no file in its fallback chain
 * contains the referenced section.
 */
export function resolveReference(
  index: TextIndex,
  reference: TextReference,
  options: ResolveOptions
): Readonly<Record<string, ResolvedSection>> {
  const out: Record<string, ResolvedSection> = {};
  for (const language of options.languages) {
    const resolved = resolveForLanguage(index, reference, language, options);
    if (resolved) {
      out[language] = resolved;
    } else if (options.onWarning) {
      options.onWarning({
        code: 'resolve-missing-section',
        message: `Reference did not resolve in language '${language}' after fallback chain exhausted.`,
        severity: 'warn',
        context: {
          path: reference.path,
          section: reference.section,
          language,
          ...(reference.selector ? { selector: reference.selector } : {})
        }
      });
    }
  }
  return Object.freeze(out);
}

function resolveForLanguage(
  index: TextIndex,
  reference: TextReference,
  language: string,
  options: Pick<
    ResolveOptions,
    'langfb' | 'dayOfWeek' | 'date' | 'season' | 'version' | 'modernStyleMonthday' | 'onWarning'
  >,
  sourceFallbackDepth = 0
): ResolvedSection | undefined {
  const { langfb, dayOfWeek, date, season, version, modernStyleMonthday, onWarning } = options;
  const synthesized = synthesizeSection(index, reference, language, options, resolveSectionByName);
  if (synthesized) {
    return synthesized;
  }

  const chain = languageFallbackChain(language, { langfb });
  for (const candidate of chain) {
    const candidatePath = swapLanguageSegment(reference.path, candidate);
    const section = resolveSectionByName(index, candidatePath, reference.section);
    if (section) {
      const selected = applySelector(index, {
        language: candidate,
        path: candidatePath,
        section,
        selector: reference.selector,
        langfb,
        dayOfWeek,
        date,
        season,
        version,
        modernStyleMonthday,
        onWarning
      });
      if (candidate !== language) {
        const sourceLocalized = resolveLocalizedSourceFallback(
          index,
          selected,
          language,
          candidate,
          options,
          sourceFallbackDepth,
          { resolveForLanguage, resolveSectionByName }
        );
        if (sourceLocalized) {
          return withComplineResponsoryBoundaries(sourceLocalized, reference, candidatePath);
        }
      }
      return withComplineResponsoryBoundaries(selected, reference, candidatePath);
    }
  }
  return undefined;
}

function resolveSectionByName(
  index: TextIndex,
  path: string,
  sectionName: string
): ParsedSection | undefined {
  const normalizedPath = ensureTxtSuffix(path);
  for (const candidate of sectionNameCandidates(sectionName)) {
    const direct = index.getSection(normalizedPath, candidate);
    if (direct) {
      return direct;
    }
  }

  const file = index.getFile(normalizedPath);
  if (!file) {
    return undefined;
  }

  const preamble = file.sections.find((section) => section.header === '__preamble');
  if (!preamble) {
    return undefined;
  }

  for (const candidate of sectionNameCandidates(sectionName)) {
    const headingContent = extractHeadingSection(preamble, candidate);
    if (headingContent) {
      return {
        header: candidate,
        condition: undefined,
        content: [...headingContent],
        startLine: preamble.startLine,
        endLine: preamble.endLine
      };
    }
  }

  return undefined;
}

function sectionNameCandidates(sectionName: string): readonly string[] {
  const trimmed = sectionName.trim();
  const withoutTrailingUnderscore = trimmed.replace(/_+$/u, '');
  const capitalized =
    withoutTrailingUnderscore.length > 0
      ? `${withoutTrailingUnderscore[0]!.toUpperCase()}${withoutTrailingUnderscore.slice(1)}`
      : withoutTrailingUnderscore;
  const canUseUnderscoreAliases = /^(?:[A-Z0-9]|.*_$)/u.test(trimmed);
  const candidates = [
    sectionName,
    trimmed,
    withoutTrailingUnderscore,
    capitalized
  ];
  if (canUseUnderscoreAliases) {
    candidates.push(`${withoutTrailingUnderscore}_`, `${capitalized}_`);
  }
  return Array.from(new Set(candidates.filter((value) => value.length > 0)));
}

function extractHeadingSection(
  preamble: ParsedSection,
  sectionName: string
): readonly TextContent[] | undefined {
  const wanted = normalizeHeading(sectionName);
  return extractSyntheticHeadingSections(preamble.content).find(
    (section) => normalizeHeading(section.header) === wanted
  )?.content;
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

interface SelectorContext {
  readonly language: string;
  readonly path: string;
  readonly section: ParsedSection;
  readonly selector?: string;
  readonly langfb?: string;
  readonly dayOfWeek?: number;
  readonly date?: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
  };
  readonly season?: ConditionEvalContext['season'];
  readonly version?: ConditionEvalContext['version'];
  readonly modernStyleMonthday?: boolean;
  readonly onWarning?: (warning: ComposeWarning) => void;
}

const INVITATORIUM_SUFFIX = '/Psalterium/Invitatorium';
const PSALMI_MINOR_SUFFIX = '/Psalterium/Psalmi/Psalmi minor';
const PSALMORUM_SEGMENT = '/Psalterium/Psalmorum/Psalm';
const MINOR_SPECIAL_SUFFIX = '/Psalterium/Special/Minor Special';

function withComplineResponsoryBoundaries(
  section: ResolvedSection,
  reference: TextReference,
  path: string
): ResolvedSection {
  if (
    reference.section !== 'Responsory Completorium' ||
    !path.endsWith(MINOR_SPECIAL_SUFFIX)
  ) {
    return section;
  }

  const content = [...section.content];
  if (content[0]?.type !== 'separator') {
    content.unshift({ type: 'separator' });
  }
  if (content.at(-1)?.type !== 'separator') {
    content.push({ type: 'separator' });
  }
  return Object.freeze({
    ...section,
    content: Object.freeze(content)
  });
}

function applySelector(
  index: TextIndex,
  context: SelectorContext
): ResolvedSection {
  const { language, path, section, selector } = context;
  if (!selector) {
    return Object.freeze({
      language,
      path,
      section,
      content: section.content,
      selectorUnhandled: false,
      selectorMissing: false
    });
  }

  if (selector === 'missing') {
    return Object.freeze({
      language,
      path,
      section,
      content: section.content,
      selectorUnhandled: true,
      selectorMissing: true
    });
  }

  const structured = resolveStructuredSelector(index, context);
  if (structured) {
    return Object.freeze({
      language,
      path,
      section,
      content: structured,
      selectorUnhandled: false,
      selectorMissing: false
    });
  }

  const integerIndex = parseIntegerSelector(selector);
  if (integerIndex !== undefined) {
    const conditionContext = selectorConditionContext(context);
    return Object.freeze({
      language,
      path,
      section,
      content:
        conditionContext
          ? selectNthVisibleContentNode(section.content, integerIndex, conditionContext)
          : selectNthContentNode(section.content, integerIndex),
      selectorUnhandled: false,
      selectorMissing: false
    });
  }

  const integerRange = parseIntegerRangeSelector(selector);
  if (integerRange) {
    const conditionContext = selectorConditionContext(context);
    return Object.freeze({
      language,
      path,
      section,
      content:
        conditionContext
          ? selectVisibleContentNodeRange(section.content, integerRange.start, integerRange.end, conditionContext)
          : selectContentNodeRange(section.content, integerRange.start, integerRange.end),
      selectorUnhandled: false,
      selectorMissing: false
    });
  }

  if (context.onWarning) {
    context.onWarning({
      code: 'resolve-unhandled-selector',
      message: `Selector '${selector}' has no resolver narrowing — returning the full section.`,
      severity: 'info',
      context: {
        path,
        section: section.header,
        language,
        selector
      }
    });
  }
  return Object.freeze({
    language,
    path,
    section,
    content: section.content,
    selectorUnhandled: true,
    selectorMissing: false
  });
}

function parseIntegerSelector(selector: string): number | undefined {
  const trimmed = selector.trim();
  if (!/^[0-9]+$/u.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > 0 ? value : undefined;
}

function parseIntegerRangeSelector(
  selector: string
): { readonly start: number; readonly end: number } | undefined {
  const match = /^\s*([0-9]+)\s*-\s*([0-9]+)\s*$/u.exec(selector);
  if (!match) return undefined;

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start <= 0 || end < start) return undefined;
  return { start, end };
}

function selectNthContentNode(
  content: readonly TextContent[],
  index: number
): readonly TextContent[] {
  if (content.every((node) => node.type === 'conditional')) {
    const narrowed: TextContent[] = [];
    for (const node of content) {
      const selectedChildren = selectNthContentNode(node.content, index);
      if (selectedChildren.length === 0) {
        continue;
      }
      narrowed.push({
        ...node,
        content: [...selectedChildren]
      });
    }
    return Object.freeze(narrowed);
  }

  const pick = content[index - 1];
  return pick ? Object.freeze([pick]) : Object.freeze([]);
}

function selectContentNodeRange(
  content: readonly TextContent[],
  start: number,
  end: number
): readonly TextContent[] {
  if (content.every((node) => node.type === 'conditional')) {
    const narrowed: TextContent[] = [];
    for (const node of content) {
      const selectedChildren = selectContentNodeRange(node.content, start, end);
      if (selectedChildren.length === 0) {
        continue;
      }
      narrowed.push({
        ...node,
        content: [...selectedChildren]
      });
    }
    return Object.freeze(narrowed);
  }

  return Object.freeze(content.slice(start - 1, end));
}

function selectorConditionContext(
  context: SelectorContext
): ConditionEvalContext | undefined {
  if (!context.date || context.dayOfWeek === undefined || !context.season || !context.version) {
    return undefined;
  }

  return {
    date: context.date,
    dayOfWeek: context.dayOfWeek,
    season: context.season,
    version: context.version
  };
}

function selectNthVisibleContentNode(
  content: readonly TextContent[],
  index: number,
  context: ConditionEvalContext
): readonly TextContent[] {
  const flattened = flattenVisibleContent(content, context);
  const pick = flattened[index - 1];
  return pick ? Object.freeze([pick]) : Object.freeze([]);
}

function selectVisibleContentNodeRange(
  content: readonly TextContent[],
  start: number,
  end: number,
  context: ConditionEvalContext
): readonly TextContent[] {
  return Object.freeze(flattenVisibleContent(content, context).slice(start - 1, end));
}

function flattenVisibleContent(
  content: readonly TextContent[],
  context: ConditionEvalContext
): readonly TextContent[] {
  const out: TextContent[] = [];
  let lastProducedRange: { readonly start: number; readonly end: number } | undefined;

  for (const node of content) {
    const start = out.length;

    if (node.type !== 'conditional') {
      out.push(node);
      lastProducedRange = { start, end: out.length };
      continue;
    }

    if (!conditionMatches(node.condition, context)) {
      lastProducedRange = undefined;
      continue;
    }

    const visibleChildren = flattenVisibleContent(node.content, context);
    if (node.condition.stopword === 'sed' && visibleChildren.length > 0) {
      if (lastProducedRange) {
        out.splice(lastProducedRange.start, lastProducedRange.end - lastProducedRange.start);
      }
      const sedStart = out.length;
      out.push(...visibleChildren);
      lastProducedRange = { start: sedStart, end: out.length };
      continue;
    }

    out.push(...visibleChildren);
    lastProducedRange =
      visibleChildren.length > 0 ? { start, end: out.length } : undefined;
  }

  return Object.freeze(out);
}

function resolveStructuredSelector(
  index: TextIndex,
  context: SelectorContext
): readonly TextContent[] | undefined {
  const selector = context.selector?.trim();
  if (!selector) {
    return undefined;
  }

  const antiphonSelector = parseAntiphonSelector(selector);
  if (
    antiphonSelector &&
    context.path.endsWith(PSALMI_MINOR_SUFFIX) &&
    isPsalmiMinorAntiphonSection(context.section.header)
  ) {
    return resolvePsalmiMinorAntiphon(index, context.path, context.section, antiphonSelector);
  }

  if (
    context.path.includes(PSALMORUM_SEGMENT) &&
    context.section.header === '__preamble'
  ) {
    const expanded = expandPsalmTokenList(index, context.language, context.langfb, selector);
    if (expanded.length > 0) {
      return expanded;
    }
  }

  if (
    context.path.endsWith(PSALMI_MINOR_SUFFIX) &&
    isKeyedPsalterSection(context.section.header) &&
    isWeekdayKey(selector)
  ) {
    return resolveMinorHourPsalmody(index, context.language, context.langfb, context.section, selector);
  }

  if (
    context.path.endsWith(INVITATORIUM_SUFFIX) &&
    context.section.header === '__preamble' &&
    context.dayOfWeek !== undefined
  ) {
    return resolveSeasonalInvitatorium(
      index,
      context.language,
      context.langfb,
      context.section,
      selector,
      context.dayOfWeek,
      context.date,
      context.modernStyleMonthday
    );
  }

  return undefined;
}

function isPsalmiMinorAntiphonSection(sectionName: string): boolean {
  return (
    sectionName === 'Tridentinum' ||
    sectionName === 'Quad' ||
    sectionName === 'Quad5_' ||
    isKeyedPsalterSection(sectionName)
  );
}

function parseAntiphonSelector(selector: string): string | undefined {
  const match = selector.match(/^(.*)#antiphon$/u);
  const key = match?.[1]?.trim();
  return key && key.length > 0 ? key : undefined;
}

function resolvePsalmiMinorAntiphon(
  index: TextIndex,
  path: string,
  section: ParsedSection,
  wantedKey: string
): readonly TextContent[] | undefined {
  const dominical =
    section.header === 'Tridentinum'
      ? resolveDominicalTridentinumAntiphon(index, path, wantedKey)
      : undefined;
  const keyed = dominical ?? selectKeyedTextContent(section.content, wantedKey);
  const firstText = firstTextValue(keyed);
  if (firstText === undefined) {
    return undefined;
  }
  const antiphon = section.header === 'Tridentinum'
    ? firstText.split(';;', 1)[0]?.trim()
    : firstText.trim();
  if (!antiphon || antiphon === '_') {
    return undefined;
  }
  return Object.freeze([{ type: 'text', value: antiphon }]);
}

function firstTextValue(content: readonly TextContent[] | undefined): string | undefined {
  if (!content) {
    return undefined;
  }

  for (const node of content) {
    if (node.type === 'text') {
      return node.value;
    }
    if (node.type === 'conditional') {
      const nested = firstTextValue(node.content);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

function resolveDominicalTridentinumAntiphon(
  index: TextIndex,
  path: string,
  wantedKey: string
): readonly TextContent[] | undefined {
  const match = wantedKey.match(/^(Prima|Tertia|Sexta|Nona)\s+(Dominica(?:\s+SQP)?)$/u);
  if (!match) {
    return undefined;
  }

  const sectionHeader = match[1];
  const matchedKey = match[2];
  const keyedHeader = matchedKey?.startsWith('Dominica') ? 'Dominica' : matchedKey;
  if (!sectionHeader || !keyedHeader) {
    return undefined;
  }

  const file = index.getFile(ensureTxtSuffix(path));
  const psalterSection = file?.sections.find((candidate) => candidate.header === sectionHeader);
  if (!psalterSection) {
    return undefined;
  }

  return selectKeyedTextContent(psalterSection.content, keyedHeader);
}
