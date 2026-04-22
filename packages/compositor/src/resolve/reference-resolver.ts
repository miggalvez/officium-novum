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
  >
): ResolvedSection | undefined {
  const { langfb, dayOfWeek, date, season, version, modernStyleMonthday, onWarning } = options;
  const chain = languageFallbackChain(language, { langfb });
  for (const candidate of chain) {
    const candidatePath = swapLanguageSegment(reference.path, candidate);
    const section = resolveSectionByName(index, candidatePath, reference.section);
    if (section) {
      return applySelector(index, {
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
  const direct = index.getSection(normalizedPath, sectionName);
  if (direct) {
    return direct;
  }

  const file = index.getFile(normalizedPath);
  if (!file) {
    return undefined;
  }

  const preamble = file.sections.find((section) => section.header === '__preamble');
  if (!preamble) {
    return undefined;
  }

  const headingContent = extractHeadingSection(preamble, sectionName);
  if (!headingContent) {
    return undefined;
  }

  return {
    header: sectionName,
    condition: undefined,
    content: [...headingContent],
    startLine: preamble.startLine,
    endLine: preamble.endLine
  };
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
const MATINS_SPECIAL_PATH = 'horas/Latin/Psalterium/Special/Matutinum Special';
const PSALMI_MINOR_SUFFIX = '/Psalterium/Psalmi/Psalmi minor';
const PSALMORUM_SEGMENT = '/Psalterium/Psalmorum/Psalm';
const WEEKDAY_KEYS = [
  'Dominica',
  'Feria II',
  'Feria III',
  'Feria IV',
  'Feria V',
  'Feria VI',
  'Sabbato'
] as const;

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

function flattenVisibleContent(
  content: readonly TextContent[],
  context: ConditionEvalContext
): readonly TextContent[] {
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type !== 'conditional') {
      out.push(node);
      continue;
    }

    if (!conditionMatches(node.condition, context)) {
      continue;
    }

    out.push(...flattenVisibleContent(node.content, context));
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
    context.section.header === 'Tridentinum'
  ) {
    return resolveTridentinumAntiphon(index, context.path, context.section, antiphonSelector);
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

function resolveSeasonalInvitatorium(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  section: ParsedSection,
  selector: string,
  dayOfWeek: number,
  date: SelectorContext['date'],
  modernStyleMonthday: boolean | undefined
): readonly TextContent[] | undefined {
  const antiphon = resolveInvitatoryAntiphonContent(
    index,
    language,
    langfb,
    selector,
    dayOfWeek,
    { date, modernStyleMonthday }
  );
  if (!antiphon) {
    return undefined;
  }

  return materializeInvitatoryContent(section.content, antiphon);
}

export function materializeInvitatoryContent(
  skeleton: readonly TextContent[],
  antiphon: readonly TextContent[],
  mode?: 'Invit2' | 'Invit3'
): readonly TextContent[] {
  const adjustedSkeleton = applyInvitatoryMaterializationMode(skeleton, mode);
  const fullAntiphon = invitatoryAntiphonVariant(antiphon, 'full');
  const repeatedAntiphon = invitatoryAntiphonVariant(antiphon, 'repeat');
  const replaced: TextContent[] = [];

  for (const node of adjustedSkeleton) {
    if (node.type === 'formulaRef' && node.name === 'ant') {
      replaced.push(...fullAntiphon);
      continue;
    }
    if (node.type === 'formulaRef' && node.name === 'ant2') {
      replaced.push(...repeatedAntiphon);
      continue;
    }
    replaced.push(node);
  }

  return Object.freeze(replaced);
}

function applyInvitatoryMaterializationMode(
  content: readonly TextContent[],
  mode?: 'Invit2' | 'Invit3'
): readonly TextContent[] {
  switch (mode) {
    case 'Invit2': {
      const [adjusted] = stripInvitatoryTailAtStar(content);
      return adjusted;
    }
    case 'Invit3':
      return applyInvit3Materialization(content);
    default:
      return content;
  }
}

function stripInvitatoryTailAtStar(
  content: readonly TextContent[]
): readonly [readonly TextContent[], boolean] {
  let stripped = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedStripped] = stripInvitatoryTailAtStar(node.content);
      out.push({
        ...node,
        content: [...nested]
      });
      stripped ||= nestedStripped;
      continue;
    }

    if (!stripped && node.type === 'verseMarker' && node.text.includes('*')) {
      out.push({
        ...node,
        text: node.text.replace(/\s+\*.*$/u, '')
      });
      stripped = true;
      continue;
    }

    out.push(node);
  }

  return [Object.freeze(out), stripped];
}

function applyInvit3Materialization(
  content: readonly TextContent[]
): readonly TextContent[] {
  const [tailAdjusted] = stripInvitatoryTailAtCaret(content);
  const out: TextContent[] = [];

  for (let index = 0; index < tailAdjusted.length; index += 1) {
    const node = tailAdjusted[index]!;
    const nextNode = tailAdjusted[index + 1];
    if (node.type === 'conditional') {
      out.push({
        ...node,
        content: [...applyInvit3Materialization(node.content)]
      });
      continue;
    }
    if (node.type === 'macroRef' && node.name === 'Gloria') {
      out.push({ type: 'formulaRef', name: 'Gloria omittitur' });
      continue;
    }
    if (
      node.type === 'formulaRef' &&
      node.name === 'ant2' &&
      nextNode?.type === 'formulaRef' &&
      nextNode.name === 'ant'
    ) {
      continue;
    }
    out.push(node);
  }

  return Object.freeze(out);
}

function stripInvitatoryTailAtCaret(
  content: readonly TextContent[]
): readonly [readonly TextContent[], boolean] {
  let stripped = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedStripped] = stripInvitatoryTailAtCaret(node.content);
      out.push({
        ...node,
        content: [...nested]
      });
      stripped ||= nestedStripped;
      continue;
    }

    if (!stripped && node.type === 'verseMarker' && /\s\^\s/u.test(node.text)) {
      const caretIndex = node.text.indexOf('^');
      const tail = node.text.slice(caretIndex + 1).trimStart();
      out.push({
        ...node,
        text: uppercaseLeadingText(tail)
      });
      stripped = true;
      continue;
    }

    out.push(node);
  }

  return [Object.freeze(out), stripped];
}

function uppercaseLeadingText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}

export function resolveInvitatoryAntiphonContent(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  selector: string,
  dayOfWeek: number,
  options?: {
    readonly date?: {
      readonly year: number;
      readonly month: number;
      readonly day: number;
    };
    readonly modernStyleMonthday?: boolean;
  }
): readonly TextContent[] | undefined {
  const source = invitatorySource(selector);
  const section = resolveAuxiliarySection(index, language, langfb, MATINS_SPECIAL_PATH, source.section);
  if (!section) {
    return undefined;
  }

  if (!source.weekdayKeyed) {
    return Object.freeze([...section.content]);
  }

  const weekdayKey = WEEKDAY_KEYS[clampDayOfWeek(dayOfWeek)] ?? WEEKDAY_KEYS[0];
  if (
    source.section === 'Invit' &&
    weekdayKey === 'Dominica' &&
    shouldUseFirstOrdinarySundayInvitatory(
      options?.date,
      options?.modernStyleMonthday ?? false
    )
  ) {
    const ordinarySunday = selectKeyedTextContent(section.content, 'Invit 1');
    if (ordinarySunday) {
      return ordinarySunday;
    }
  }
  return selectKeyedTextContent(section.content, weekdayKey);
}

function invitatoryAntiphonVariant(
  content: readonly TextContent[],
  mode: 'full' | 'repeat'
): readonly TextContent[] {
  const [variant, captured] = invitatoryAntiphonVariantInner(content, mode);
  return captured ? Object.freeze(variant) : content;
}

function invitatoryAntiphonVariantInner(
  content: readonly TextContent[],
  mode: 'full' | 'repeat'
): readonly [readonly TextContent[], boolean] {
  let captured = false;
  const out: TextContent[] = [];

  for (const node of content) {
    if (node.type === 'conditional') {
      const [nested, nestedCaptured] = invitatoryAntiphonVariantInner(node.content, mode);
      out.push({
        ...node,
        content: [...nested]
      });
      captured ||= nestedCaptured;
      continue;
    }
    if (!captured && node.type === 'text') {
      out.push({
        type: 'verseMarker',
        marker: 'Ant.',
        text: mode === 'repeat' ? invitatoryRepeatText(node.value) : node.value
      });
      captured = true;
      continue;
    }
    out.push(node);
  }

  return [Object.freeze(out), captured];
}

function invitatoryRepeatText(text: string): string {
  const starIndex = text.indexOf('*');
  if (starIndex === -1) {
    return text.trim();
  }
  return text.slice(starIndex + 1).trim();
}

function invitatorySource(
  selector: string
): { readonly section: string; readonly weekdayKeyed: boolean } {
  switch (selector) {
    case 'Adventus':
      return { section: 'Invit Adv', weekdayKeyed: false };
    case 'Quadragesima':
      return { section: 'Invit Quad', weekdayKeyed: false };
    case 'Passio':
      return { section: 'Invit Quad5', weekdayKeyed: false };
    case 'Pascha':
    case 'Ascensio':
    case 'Pentecostes':
      return { section: 'Invit Pasch', weekdayKeyed: false };
    case 'Nativitatis':
    case 'Epiphania':
    case 'Septuagesima':
    case 'PostPentecosten':
    default:
      return { section: 'Invit', weekdayKeyed: true };
  }
}

function resolveMinorHourPsalmody(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  section: ParsedSection,
  selector: string
): readonly TextContent[] | undefined {
  return resolveKeyedMinorHourContent(index, language, langfb, section.content, selector);
}

function expandPsalmTokenList(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  selector: string
): readonly TextContent[] {
  const tokens = parsePsalmTokens(selector);
  const out: TextContent[] = [];

  for (const token of tokens) {
    const expanded = resolvePsalmToken(index, language, langfb, token);
    if (!expanded || expanded.length === 0) {
      continue;
    }
    if (out.length > 0) {
      out.push({ type: 'separator' });
    }
    out.push(...expanded);
  }

  return finalizeContent(out) ?? Object.freeze([]);
}

interface PsalmToken {
  readonly psalmNumber: number;
  readonly range?: VerseRange;
}

interface VerseRange {
  readonly start: VerseBound;
  readonly end: VerseBound;
}

interface VerseBound {
  readonly number: number;
  readonly suffix?: string;
}

function parsePsalmTokens(selector: string): readonly PsalmToken[] {
  const tokens: PsalmToken[] = [];
  for (const rawToken of selector.split(',')) {
    const token = parsePsalmToken(rawToken);
    if (token) {
      tokens.push(token);
    }
  }
  return Object.freeze(tokens);
}

function parsePsalmToken(rawToken: string): PsalmToken | undefined {
  const trimmed = rawToken.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = trimmed.match(/^\[?(\d+)\]?(?:\(([^)]+)\))?$/u);
  if (!match) {
    return undefined;
  }

  const numberRaw = match[1];
  const rangeRaw = match[2];
  if (!numberRaw) {
    return undefined;
  }

  const psalmNumber = Number(numberRaw);
  if (!Number.isFinite(psalmNumber) || psalmNumber <= 0) {
    return undefined;
  }

  const range = parseVerseRange(rangeRaw);
  return range ? { psalmNumber, range } : { psalmNumber };
}

function parseVerseRange(rawRange: string | undefined): VerseRange | undefined {
  if (!rawRange) {
    return undefined;
  }

  const [startRaw, endRaw] = rawRange.split('-', 2);
  if (!startRaw || !endRaw) {
    return undefined;
  }

  const start = parseVerseBound(startRaw);
  const end = parseVerseBound(endRaw);
  if (!start || !end) {
    return undefined;
  }

  return { start, end };
}

function parseVerseBound(rawBound: string): VerseBound | undefined {
  const normalized = rawBound.replace(/['\s]/gu, '');
  const match = normalized.match(/^(\d+)([a-z])?$/iu);
  if (!match) {
    return undefined;
  }

  const numberRaw = match[1];
  const suffixRaw = match[2];
  if (!numberRaw) {
    return undefined;
  }

  const number = Number(numberRaw);
  if (!Number.isFinite(number) || number <= 0) {
    return undefined;
  }

  return suffixRaw ? { number, suffix: suffixRaw.toLowerCase() } : { number };
}

function resolvePsalmToken(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  token: PsalmToken
): readonly TextContent[] | undefined {
  const section = resolveAuxiliarySection(
    index,
    language,
    langfb,
    `horas/Latin/Psalterium/Psalmorum/Psalm${token.psalmNumber}`,
    '__preamble'
  );
  if (!section) {
    return undefined;
  }

  const sliced = token.range ? slicePsalmContent(section.content, token.range) : section.content;
  return asLinewiseContent(sliced);
}

function slicePsalmContent(
  content: readonly TextContent[],
  range: VerseRange
): readonly TextContent[] {
  const selected: TextContent[] = [];
  let sawVerse = false;

  for (const node of content) {
    if (node.type !== 'text') {
      if (!sawVerse) {
        selected.push(node);
      }
      continue;
    }

    const verse = parseVerseLabel(node.value);
    if (!verse) {
      if (!sawVerse) {
        selected.push(node);
      }
      continue;
    }

    sawVerse = true;
    if (compareVerseBounds(verse, range.start) < 0) {
      continue;
    }
    if (compareVerseBounds(verse, range.end) > 0) {
      continue;
    }
    selected.push(node);
  }

  return selected.length > 0 ? Object.freeze(selected) : content;
}

function parseVerseLabel(line: string): VerseBound | undefined {
  const match = line.match(/^\d+:(\d+)([a-z])?/iu);
  if (!match) {
    return undefined;
  }

  const numberRaw = match[1];
  const suffixRaw = match[2];
  if (!numberRaw) {
    return undefined;
  }

  const number = Number(numberRaw);
  if (!Number.isFinite(number) || number <= 0) {
    return undefined;
  }

  return suffixRaw ? { number, suffix: suffixRaw.toLowerCase() } : { number };
}

function compareVerseBounds(left: VerseBound, right: VerseBound): number {
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

function asLinewiseContent(content: readonly TextContent[]): readonly TextContent[] {
  const linewise: TextContent[] = [];

  for (const node of content) {
    linewise.push(node);
    if (node.type !== 'separator') {
      linewise.push({ type: 'separator' });
    }
  }

  return finalizeContent(linewise) ?? Object.freeze([]);
}

function finalizeContent(content: readonly TextContent[]): readonly TextContent[] | undefined {
  const normalized = [...content];
  while (normalized.at(-1)?.type === 'separator') {
    normalized.pop();
  }
  return normalized.length > 0 ? Object.freeze(normalized) : undefined;
}

function resolveAuxiliarySection(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  latinPath: string,
  sectionName: string
): ParsedSection | undefined {
  const chain = languageFallbackChain(language, { langfb });
  for (const candidate of chain) {
    const candidatePath = swapLanguageSegment(latinPath, candidate);
    const section = index.getSection(ensureTxtSuffix(candidatePath), sectionName);
    if (section) {
      return section;
    }
  }
  return undefined;
}

function resolveKeyedMinorHourContent(
  textIndex: TextIndex,
  language: string,
  langfb: string | undefined,
  content: readonly TextContent[],
  wantedKey: string
): readonly TextContent[] | undefined {
  for (let contentIndex = 0; contentIndex < content.length; contentIndex += 1) {
    const node = content[contentIndex];
    if (node?.type === 'conditional') {
      const nested = resolveKeyedMinorHourContent(
        textIndex,
        language,
        langfb,
        node.content,
        wantedKey
      );
      if (nested) {
        return wrapSelectedContent(node, nested);
      }
      continue;
    }
    if (!node || node.type !== 'text') {
      continue;
    }

    const keyed = parseKeyedText(node.value);
    if (!keyed || normalizeKey(keyed.key) !== normalizeKey(wantedKey)) {
      continue;
    }

    const psalmSpec = nextTextValue(content, contentIndex + 1);
    if (psalmSpec === undefined) {
      return undefined;
    }

    const out: TextContent[] = [];
    if (keyed.value.length > 0 && keyed.value !== '_') {
      out.push({ type: 'text', value: keyed.value });
      out.push({ type: 'separator' });
    }

    const psalmContent = expandPsalmTokenList(textIndex, language, langfb, psalmSpec);
    out.push(...psalmContent);

    return finalizeContent(out);
  }

  return undefined;
}

function parseAntiphonSelector(selector: string): string | undefined {
  const match = selector.match(/^(.*)#antiphon$/u);
  const key = match?.[1]?.trim();
  return key && key.length > 0 ? key : undefined;
}

function resolveTridentinumAntiphon(
  index: TextIndex,
  path: string,
  section: ParsedSection,
  wantedKey: string
): readonly TextContent[] | undefined {
  const dominical = resolveDominicalTridentinumAntiphon(index, path, wantedKey);
  const keyed = dominical ?? selectKeyedTextContent(section.content, wantedKey);
  const firstText = keyed?.find((node) => node.type === 'text');
  if (!firstText || firstText.type !== 'text') {
    return undefined;
  }
  const antiphon = firstText.value.split(';;', 1)[0]?.trim();
  if (!antiphon) {
    return undefined;
  }
  return Object.freeze([{ type: 'text', value: antiphon }]);
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

function selectKeyedTextContent(
  content: readonly TextContent[],
  wantedKey: string
): readonly TextContent[] | undefined {
  for (const node of content) {
    if (node.type === 'conditional') {
      const nested = selectKeyedTextContent(node.content, wantedKey);
      if (nested) {
        return wrapSelectedContent(node, nested);
      }
      continue;
    }
    if (node.type !== 'text') {
      continue;
    }
    const keyed = parseKeyedText(node.value);
    if (keyed && normalizeKey(keyed.key) === normalizeKey(wantedKey)) {
      return keyed.value.length > 0
        ? Object.freeze([{ type: 'text', value: keyed.value }])
        : Object.freeze([]);
    }
  }
  return undefined;
}

function parseKeyedText(value: string): { readonly key: string; readonly value: string } | undefined {
  const match = value.match(/^([^=]+?)\s*=\s*(.*)$/u);
  if (!match) {
    return undefined;
  }

  const key = match[1]?.trim();
  const text = match[2]?.trim() ?? '';
  if (!key) {
    return undefined;
  }

  return { key, value: text };
}

function nextTextValue(content: readonly TextContent[], startIndex: number): string | undefined {
  for (let index = startIndex; index < content.length; index += 1) {
    const node = content[index];
    if (node?.type === 'text') {
      return node.value.trim();
    }
    if (node?.type === 'conditional') {
      const nested = nextTextValue(node.content, 0);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function shouldUseFirstOrdinarySundayInvitatory(
  date:
    | {
        readonly year: number;
        readonly month: number;
        readonly day: number;
      }
    | undefined,
  modernStyleMonthday: boolean
): boolean {
  if (!date) {
    return false;
  }
  if (date.month < 4) {
    return true;
  }
  const monthday = computeMonthdayKey(date, modernStyleMonthday);
  return monthday ? /^1\d\d-/u.test(monthday) : false;
}

function computeMonthdayKey(
  date: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
  },
  modernStyle: boolean
): string | undefined {
  if (date.month < 7) {
    return undefined;
  }

  const currentDayOfYear = dateToDayOfYear(date.day, date.month, date.year);
  let liturgicalMonth = 0;
  const firstSundays: number[] = [];

  for (let month = 8; month <= 12; month += 1) {
    const firstOfMonth = dateToDayOfYear(1, month, date.year);
    const weekday = dayOfWeek(1, month, date.year);
    let firstSunday = firstOfMonth - weekday;
    if (weekday >= 4 || (weekday > 0 && modernStyle)) {
      firstSunday += 7;
    }
    firstSundays[month - 8] = firstSunday;

    if (currentDayOfYear >= firstSunday) {
      liturgicalMonth = month;
    } else {
      break;
    }
  }

  if (liturgicalMonth === 0) {
    return undefined;
  }

  const adventStart = getAdventStartDayOfYear(date.year);
  if (liturgicalMonth > 10 && currentDayOfYear >= adventStart) {
    return undefined;
  }

  let week = Math.floor((currentDayOfYear - firstSundays[liturgicalMonth - 8]!) / 7);

  if (
    liturgicalMonth === 10 &&
    modernStyle &&
    week >= 2 &&
    dayOfMonthFromDayOfYear(firstSundays[10 - 8]!, date.year) >= 4
  ) {
    week += 1;
  }

  if (liturgicalMonth === 11 && (week > 0 || modernStyle)) {
    week = 4 - Math.floor((adventStart - currentDayOfYear - 1) / 7);
    if (modernStyle && week === 1) {
      week = 0;
    }
  }

  return `${String(liturgicalMonth).padStart(2, '0')}${week + 1}-${dayOfWeek(
    date.day,
    date.month,
    date.year
  )}`;
}

function getAdventStartDayOfYear(year: number): number {
  const christmas = dateToDayOfYear(25, 12, year);
  const christmasWeekday = dayOfWeek(25, 12, year) || 7;
  return christmas - christmasWeekday - 21;
}

function dayOfMonthFromDayOfYear(dayOfYear: number, year: number): number {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  let remaining = dayOfYear;
  for (const length of monthLengths) {
    if (remaining <= length) {
      return remaining;
    }
    remaining -= length;
  }
  return remaining;
}

function dateToDayOfYear(day: number, month: number, year: number): number {
  const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leapOffset = isLeapYear(year) && month > 2 ? 1 : 0;
  return monthOffsets[month - 1]! + day + leapOffset;
}

function dayOfWeek(day: number, month: number, year: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function wrapSelectedContent(
  node: Extract<TextContent, { type: 'conditional' }>,
  content: readonly TextContent[]
): readonly TextContent[] {
  return Object.freeze([
    {
      type: 'conditional',
      condition: node.condition,
      content: [...content],
      scope: node.scope
    }
  ]);
}

function normalizeKey(key: string): string {
  return key.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isWeekdayKey(selector: string): boolean {
  return WEEKDAY_KEYS.some((key) => normalizeKey(key) === normalizeKey(selector));
}

function isKeyedPsalterSection(sectionName: string): boolean {
  return (
    sectionName === 'Prima' ||
    sectionName === 'Tertia' ||
    sectionName === 'Sexta' ||
    sectionName === 'Nona' ||
    sectionName === 'Completorium'
  );
}

function clampDayOfWeek(dayOfWeek: number): number {
  if (!Number.isFinite(dayOfWeek)) {
    return 0;
  }
  if (dayOfWeek < 0) {
    return 0;
  }
  if (dayOfWeek > 6) {
    return 6;
  }
  return Math.trunc(dayOfWeek);
}

/**
 * Replace the `Latin/` segment in a Phase-2-emitted reference path with the
 * requested language. Paths from Phase 2 are always Latin-rooted, e.g.
 * `horas/Latin/Commune/C4` or `horas/Latin/Psalterium/Major Special/Te Deum`.
 */
export function swapLanguageSegment(path: string, language: string): string {
  if (language === 'Latin') {
    return path;
  }
  if (path.startsWith('horas/Latin/')) {
    return `horas/${language}/${path.slice('horas/Latin/'.length)}`;
  }
  if (path.startsWith('missa/Latin/')) {
    return `missa/${language}/${path.slice('missa/Latin/'.length)}`;
  }
  if (path.startsWith('Latin/')) {
    return `${language}/${path.slice('Latin/'.length)}`;
  }
  return path;
}
