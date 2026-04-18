import {
  ensureTxtSuffix,
  languageFallbackChain,
  type ParsedSection,
  type TextContent,
  type TextIndex
} from '@officium-novum/parser';
import type { TextReference } from '@officium-novum/rubrical-engine';

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
 *     (1-based) from the section. Emitted by Phase 2 when Matins line-picks
 *     antiphons or versicles from the psalterium (`matins-plan.ts`
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
    }
  }
  return Object.freeze(out);
}

function resolveForLanguage(
  index: TextIndex,
  reference: TextReference,
  language: string,
  options: Pick<ResolveOptions, 'langfb' | 'dayOfWeek'>
): ResolvedSection | undefined {
  const { langfb, dayOfWeek } = options;
  const chain = languageFallbackChain(language, { langfb });
  for (const candidate of chain) {
    const candidatePath = swapLanguageSegment(reference.path, candidate);
    const section = index.getSection(ensureTxtSuffix(candidatePath), reference.section);
    if (section) {
      return applySelector(index, {
        language: candidate,
        path: candidatePath,
        section,
        selector: reference.selector,
        langfb,
        dayOfWeek
      });
    }
  }
  return undefined;
}

interface SelectorContext {
  readonly language: string;
  readonly path: string;
  readonly section: ParsedSection;
  readonly selector?: string;
  readonly langfb?: string;
  readonly dayOfWeek?: number;
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
    const pick = section.content[integerIndex - 1];
    return Object.freeze({
      language,
      path,
      section,
      content: pick ? Object.freeze([pick]) : Object.freeze([]),
      selectorUnhandled: false,
      selectorMissing: false
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

function resolveStructuredSelector(
  index: TextIndex,
  context: SelectorContext
): readonly TextContent[] | undefined {
  const selector = context.selector?.trim();
  if (!selector) {
    return undefined;
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
    isMinorHourSection(context.section.header) &&
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
      context.dayOfWeek
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
  dayOfWeek: number
): readonly TextContent[] | undefined {
  const antiphon = resolveInvitatoryAntiphon(index, language, langfb, selector, dayOfWeek);
  if (!antiphon) {
    return undefined;
  }

  const replaced: TextContent[] = [];
  for (const node of section.content) {
    if (node.type === 'formulaRef' && (node.name === 'ant' || node.name === 'ant2')) {
      replaced.push(...antiphon);
      continue;
    }
    replaced.push(node);
  }

  return Object.freeze(replaced);
}

function resolveInvitatoryAntiphon(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  selector: string,
  dayOfWeek: number
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
  const value = selectKeyedTextValue(section.content, weekdayKey);
  if (value === undefined) {
    return undefined;
  }

  return value.length > 0
    ? Object.freeze([{ type: 'text', value }])
    : Object.freeze([]);
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
  const entry = selectKeyedPair(section.content, selector);
  if (!entry) {
    return undefined;
  }

  const out: TextContent[] = [];
  if (entry.antiphon.length > 0 && entry.antiphon !== '_') {
    out.push({ type: 'text', value: entry.antiphon });
    out.push({ type: 'separator' });
  }

  const psalmContent = expandPsalmTokenList(index, language, langfb, entry.psalms);
  out.push(...psalmContent);

  return finalizeContent(out);
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

function selectKeyedPair(
  content: readonly TextContent[],
  wantedKey: string
): { readonly antiphon: string; readonly psalms: string } | undefined {
  for (let index = 0; index < content.length; index += 1) {
    const node = content[index];
    if (!node || node.type !== 'text') {
      continue;
    }

    const keyed = parseKeyedText(node.value);
    if (!keyed || normalizeKey(keyed.key) !== normalizeKey(wantedKey)) {
      continue;
    }

    const psalmSpec = nextTextValue(content, index + 1);
    if (psalmSpec === undefined) {
      return undefined;
    }

    return {
      antiphon: keyed.value,
      psalms: psalmSpec
    };
  }

  return undefined;
}

function selectKeyedTextValue(
  content: readonly TextContent[],
  wantedKey: string
): string | undefined {
  for (const node of content) {
    if (node.type !== 'text') {
      continue;
    }
    const keyed = parseKeyedText(node.value);
    if (keyed && normalizeKey(keyed.key) === normalizeKey(wantedKey)) {
      return keyed.value;
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
  }
  return undefined;
}

function normalizeKey(key: string): string {
  return key.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isWeekdayKey(selector: string): boolean {
  return WEEKDAY_KEYS.some((key) => normalizeKey(key) === normalizeKey(selector));
}

function isMinorHourSection(sectionName: string): boolean {
  return sectionName === 'Prima' || sectionName === 'Tertia' || sectionName === 'Sexta' || sectionName === 'Nona';
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
