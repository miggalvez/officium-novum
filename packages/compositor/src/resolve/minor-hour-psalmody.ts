import type { ParsedSection, TextContent, TextIndex } from '@officium-novum/parser';

import {
  nextTextValue,
  normalizeKey,
  parseKeyedText,
  wrapSelectedContent
} from './keyed-content.js';
import { resolveAuxiliarySection } from './path.js';

export function resolveMinorHourPsalmody(
  index: TextIndex,
  language: string,
  langfb: string | undefined,
  section: ParsedSection,
  selector: string
): readonly TextContent[] | undefined {
  return resolveKeyedMinorHourContent(index, language, langfb, section.content, selector);
}

export function expandPsalmTokenList(
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

function finalizeContent(content: readonly TextContent[]): readonly TextContent[] | undefined {
  const normalized = [...content];
  while (normalized.at(-1)?.type === 'separator') {
    normalized.pop();
  }
  return normalized.length > 0 ? Object.freeze(normalized) : undefined;
}
