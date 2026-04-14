import type { TextContent } from '../types/schema.js';
import type { CrossReference, LineSelector, Substitution } from '../types/directives.js';

const VERSE_MARKER_REGEX =
  /^(R\.br\.|Responsorium\.|Benedictio\.|Absolutio\.|Ant\.|v\.|r\.|V\.|R\.|M\.|S\.)\s*(.*)$/u;
const PSALM_DIRECTIVE_REGEX = /^(.*?)\s*;;\s*(\d+)(?:\s*;;\s*(.+))?$/u;
const SUBSTITUTION_REGEX = /^s\/((?:\\.|[^/])*)\/((?:\\.|[^/])*)\/([a-z]*)$/iu;
type VerseMarker = Extract<TextContent, { type: 'verseMarker' }>['marker'];
const TRAILING_CONTRACTION_REGEX = /~\s*$/u;

export class DirectiveParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectiveParseError';
  }
}

export function parseDirectiveLine(line: string): TextContent {
  const normalizedLine = stripTrailingContractionMarker(line);

  if (normalizedLine.startsWith('~')) {
    return {
      type: 'text',
      value: normalizedLine.slice(1)
    };
  }

  const trimmed = normalizedLine.trim();

  if (trimmed === '_') {
    return { type: 'separator' };
  }

  if (trimmed.startsWith('#')) {
    return {
      type: 'heading',
      value: trimmed.slice(1).trim()
    };
  }

  if (trimmed.startsWith('@')) {
    return {
      type: 'reference',
      ref: parseCrossReference(trimmed)
    };
  }

  const psalmDirective = parsePsalmReference(trimmed);
  if (psalmDirective) {
    return psalmDirective;
  }

  const psalmIncludeMatch = trimmed.match(/^&psalm\((\d+)\)$/iu);
  if (psalmIncludeMatch) {
    return {
      type: 'psalmInclude',
      psalmNumber: Number(psalmIncludeMatch[1])
    };
  }

  const macroMatch = trimmed.match(/^&([\p{L}\p{N}_][\p{L}\p{N}_.-]*)$/u);
  if (macroMatch) {
    const macroName = macroMatch[1];
    if (!macroName) {
      throw new DirectiveParseError(`Invalid macro directive '${line}'.`);
    }

    return {
      type: 'macroRef',
      name: macroName
    };
  }

  if (trimmed.startsWith('$')) {
    return {
      type: 'formulaRef',
      name: trimmed.slice(1).trim()
    };
  }

  if (trimmed.startsWith('!')) {
    const value = trimmed.slice(1).trim();
    return isScriptureCitation(value)
      ? { type: 'citation', value }
      : { type: 'rubric', value };
  }

  const verseMarker = trimmed.match(VERSE_MARKER_REGEX);
  if (verseMarker) {
    const marker = verseMarker[1];
    const text = verseMarker[2];
    if (!marker || text === undefined) {
      throw new DirectiveParseError(`Invalid verse marker '${line}'.`);
    }

    return {
      type: 'verseMarker',
      marker: marker as VerseMarker,
      text
    };
  }

  const gabcNotation = parseGabcNotation(trimmed);
  if (gabcNotation) {
    return {
      type: 'gabcNotation',
      notation: gabcNotation
    };
  }

  return {
    type: 'text',
    value: normalizedLine
  };
}

export function parseDirectiveLines(lines: readonly string[]): TextContent[] {
  return contractTrailingLines(lines).map((line) => parseDirectiveLine(line));
}

export function contractTrailingLines(lines: readonly string[]): string[] {
  const merged: string[] = [];
  let buffer = '';

  for (const line of lines) {
    const hasContinuation = hasTrailingContractionMarker(line);
    const stripped = stripTrailingContractionMarker(line);
    buffer += stripped;

    if (!hasContinuation) {
      merged.push(buffer);
      buffer = '';
    }
  }

  if (buffer.length > 0) {
    merged.push(buffer);
  }

  return merged;
}

export function parseCrossReference(referenceLine: string): CrossReference {
  let body = referenceLine.trim();
  if (body.startsWith('@')) {
    body = body.slice(1);
  }

  if (!body) {
    throw new DirectiveParseError('Reference directive cannot be empty.');
  }

  const extractedSubstitutions = extractSubstitutions(body);
  body = extractedSubstitutions.remainder;

  const extractedSelector = extractLineSelector(body);
  body = extractedSelector.remainder;

  const parsedPathSection = parsePathAndSection(body);
  return {
    path: parsedPathSection.path,
    section: parsedPathSection.section,
    lineSelector: extractedSelector.value,
    substitutions: extractedSubstitutions.values,
    isPreamble: parsedPathSection.section === '__preamble'
  };
}

export function parseLineSelector(selector: string): LineSelector {
  const trimmed = selector.trim();
  const inverse = trimmed.startsWith('!');
  const body = inverse ? trimmed.slice(1) : trimmed;

  if (!/^\d+(?:-\d+)?$/u.test(body)) {
    throw new DirectiveParseError(`Invalid line selector '${selector}'.`);
  }

  const [startRaw, endRaw] = body.split('-');
  if (!startRaw) {
    throw new DirectiveParseError(`Invalid line selector '${selector}'.`);
  }

  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : undefined;

  if (inverse) {
    return { type: 'inverse', start, end };
  }

  if (end !== undefined) {
    return { type: 'range', start, end };
  }

  return { type: 'single', start };
}

export function parseSubstitution(substitution: string): Substitution {
  const match = substitution.trim().match(SUBSTITUTION_REGEX);
  if (!match) {
    throw new DirectiveParseError(`Invalid substitution directive '${substitution}'.`);
  }

  const pattern = match[1];
  const replacement = match[2];
  const flags = match[3];

  if (pattern === undefined || replacement === undefined || flags === undefined) {
    throw new DirectiveParseError(`Invalid substitution directive '${substitution}'.`);
  }

  return {
    pattern,
    replacement,
    flags
  };
}

function parsePsalmReference(line: string): TextContent | undefined {
  const match = line.match(PSALM_DIRECTIVE_REGEX);
  if (!match) {
    return undefined;
  }

  const antiphonValue = match[1];
  const psalmNumberValue = match[2];
  const toneValue = match[3];

  if (antiphonValue === undefined || psalmNumberValue === undefined) {
    throw new DirectiveParseError(`Invalid psalm directive '${line}'.`);
  }

  const antiphon = antiphonValue.trim();
  const tone = toneValue?.trim();
  const parsed: Extract<TextContent, { type: 'psalmRef' }> = {
    type: 'psalmRef',
    psalmNumber: Number(psalmNumberValue)
  };

  if (antiphon.length > 0) {
    parsed.antiphon = antiphon;
  }

  if (tone && tone.length > 0) {
    parsed.tone = tone;
  }

  return parsed;
}

function parseGabcNotation(
  line: string
):
  | { kind: 'header'; notation: string; text?: string }
  | { kind: 'path'; path: string }
  | { kind: 'inline'; notation: string }
  | undefined {
  const pathMatch = line.match(/^\{gabc:([^}]+)\}$/u);
  if (pathMatch) {
    const path = pathMatch[1];
    if (!path) {
      throw new DirectiveParseError(`Invalid gabc path directive '${line}'.`);
    }

    return {
      kind: 'path',
      path: path.trim()
    };
  }

  const headerMatch = line.match(/^(\{:H-[^}]*:\})(.*)$/u);
  if (headerMatch) {
    const notation = headerMatch[1];
    const trailingTextRaw = headerMatch[2];
    if (!notation || trailingTextRaw === undefined) {
      throw new DirectiveParseError(`Invalid gabc header directive '${line}'.`);
    }

    const trailingText = trailingTextRaw.trim();
    return {
      kind: 'header',
      notation,
      text: trailingText.length > 0 ? trailingText : undefined
    };
  }

  if (/^\{name:[^{}]*%%[^{}]*\}$/u.test(line)) {
    return {
      kind: 'inline',
      notation: line
    };
  }

  if (/^\{\(c\d+\).*\}$/u.test(line) || /^\{\(c\d+\)[^}]*\}$/u.test(line)) {
    return {
      kind: 'inline',
      notation: line
    };
  }

  return undefined;
}

function isScriptureCitation(value: string): boolean {
  const normalized = value.trim();

  if (!/\d/u.test(normalized)) {
    return false;
  }

  return /^(?:[1-4]\s*)?[A-Z][\p{L}.]{1,10}\s+\d+(?::\d+(?:[-,]\d+)?)?$/u.test(normalized);
}

function extractSubstitutions(
  input: string
): { remainder: string; values: Substitution[] } {
  const values: Substitution[] = [];
  let remainder = input;

  while (true) {
    const extracted = extractTrailingSubstitution(remainder);
    if (!extracted) {
      break;
    }

    values.unshift(extracted.value);
    remainder = extracted.remainder;
  }

  return { remainder, values };
}

function extractTrailingSubstitution(
  input: string
): { remainder: string; value: Substitution } | undefined {
  const trimmed = input.trimEnd();
  let searchIndex = trimmed.length;

  while (searchIndex > 0) {
    const start = trimmed.lastIndexOf('s/', searchIndex - 1);
    if (start < 0) {
      return undefined;
    }

    if (!isValidSubstitutionBoundary(trimmed, start)) {
      searchIndex = start;
      continue;
    }

    const token = trimmed.slice(start);

    try {
      const value = parseSubstitution(token);
      const remainderEnd = start > 0 && trimmed[start - 1] === ':' ? start - 1 : start;

      return {
        remainder: trimmed.slice(0, remainderEnd).trimEnd(),
        value
      };
    } catch {
      searchIndex = start;
    }
  }

  return undefined;
}

function isValidSubstitutionBoundary(input: string, start: number): boolean {
  if (start === 0) {
    return true;
  }

  const boundary = input[start - 1];
  if (!boundary) {
    return false;
  }

  return boundary === ':' || /\s/u.test(boundary);
}

function hasTrailingContractionMarker(line: string): boolean {
  return TRAILING_CONTRACTION_REGEX.test(line);
}

function stripTrailingContractionMarker(line: string): string {
  return line.replace(TRAILING_CONTRACTION_REGEX, '');
}

function extractLineSelector(
  input: string
): { remainder: string; value?: LineSelector } {
  const match = input.match(/:(!?\d+(?:-\d+)?)$/u);
  if (!match) {
    return { remainder: input };
  }

  const fullMatch = match[0];
  const selector = match[1];
  if (!fullMatch || !selector) {
    return { remainder: input };
  }

  return {
    remainder: input.slice(0, -fullMatch.length),
    value: parseLineSelector(selector)
  };
}

function parsePathAndSection(input: string): { path?: string; section?: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith(':')) {
    const sectionOnly = trimmed.slice(1).trim();
    return {
      section: sectionOnly.length > 0 ? sectionOnly : undefined
    };
  }

  const firstColonIndex = trimmed.indexOf(':');
  if (firstColonIndex < 0) {
    return {
      path: trimmed
    };
  }

  const path = trimmed.slice(0, firstColonIndex).trim();
  const section = trimmed.slice(firstColonIndex + 1).trim();

  return {
    path: path.length > 0 ? path : undefined,
    section: section.length > 0 ? section : undefined
  };
}
