import type { Condition, ConditionalScope } from '../types/conditions.js';
import type { TextContent } from '../types/schema.js';
import type { CrossReference, LineSelector, Substitution } from '../types/directives.js';

import { parseCondition, ConditionParseError } from './condition-parser.js';

const VERSE_MARKER_REGEX =
  /^(R\.br\.|Responsorium\.|Benedictio\.|Absolutio\.|Ant\.|v\.|r\.|V\.|R\.|M\.|S\.)\s*(.*)$/u;
const PSALM_DIRECTIVE_REGEX = /^(.*?)\s*;;\s*(\d+(?:\([^)]+\))?)(?:\s*;;\s*(.+))?$/u;
const SUBSTITUTION_REGEX = /^s\/((?:\\.|[^/])*)\/((?:\\.|[^/])*)\/([a-z]*)$/iu;
type VerseMarker = Extract<TextContent, { type: 'verseMarker' }>['marker'];
const TRAILING_CONTRACTION_REGEX = /~\s*$/u;
const DEFAULT_SCOPE: ConditionalScope = Object.freeze({
  backwardLines: 0,
  forwardMode: 'line'
});

const LEADING_CONDITION_REGEX = /^\s*\(([^()]+(?:\([^)]*\)[^()]*)*)\)\s*(.*)$/u;

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
  return buildSectionContentFromLines(lines);
}

/**
 * Structured result of lexing one raw source line. Richer than
 * {@link parseDirectiveLine} — exposes inline `/:rubric:/` segments, a
 * leading `(condition)` prefix, and the parenthesized-only shape used by the
 * section-level preprocessor for `sed`/alternation handling.
 *
 * Examples:
 *   `"(rubrica altovadensis) $rubrica Incipit"` →
 *     `{ kind: 'content', leadingCondition, nodes: [formulaRef] }`
 *   `"/:Fit reverentia:/ Sanctus, Sanctus"` →
 *     `{ kind: 'content', nodes: [rubric, text] }`
 *   `"(sed rubrica 196 omittuntur)"` →
 *     `{ kind: 'bareCondition', condition }`
 */
export type LexedLine =
  | { kind: 'content'; leadingCondition?: Condition; nodes: TextContent[] }
  | { kind: 'bareCondition'; condition: Condition }
  | { kind: 'bareMetadata' };

export function lexSourceLine(line: string): LexedLine {
  const normalizedLine = stripTrailingContractionMarker(line);
  const trimmed = normalizedLine.trim();

  const bare = tryParseBareCondition(trimmed);
  if (bare) {
    return { kind: 'bareCondition', condition: bare };
  }

  if (isBareMetadataLine(trimmed)) {
    return { kind: 'bareMetadata' };
  }

  const { leadingCondition, remainder } = extractLeadingCondition(normalizedLine);
  const segments = segmentInlineRubrics(remainder);
  const nodes: TextContent[] = [];
  for (const segment of segments) {
    if (segment.kind === 'rubric') {
      if (segment.value.length > 0) {
        nodes.push({ type: 'rubric', value: segment.value });
      }
      continue;
    }
    if (segment.value.length === 0) {
      continue;
    }
    nodes.push(parseDirectiveLine(segment.value));
  }

  if (nodes.length === 0 && leadingCondition) {
    return { kind: 'content', leadingCondition, nodes: [] };
  }

  if (leadingCondition) {
    return { kind: 'content', leadingCondition, nodes };
  }

  return { kind: 'content', nodes };
}

const METADATA_TOKENS = new Set<string>([
  'si',
  'sed',
  'vero',
  'atque',
  'attamen',
  'deinde',
  'dicitur',
  'dicuntur',
  'omittitur',
  'omittuntur',
  'semper'
]);

/**
 * Recognize parenthesized "rubric connector" lines that carry stopwords and
 * instructions but no actual condition predicate — e.g. `(deinde dicitur)`,
 * `(atque dicuntur semper)`, `(sed dicitur)`. These function as metadata in
 * the source file and should not produce visible output.
 */
function isBareMetadataLine(trimmed: string): boolean {
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return false;
  }
  if (!isBalancedWrappingParens(trimmed)) {
    return false;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return false;
  }
  const tokens = inner.split(/\s+/u);
  return tokens.length > 0 && tokens.every((token) => METADATA_TOKENS.has(token.toLowerCase()));
}

function tryParseBareCondition(trimmed: string): Condition | undefined {
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  if (!isBalancedWrappingParens(trimmed)) {
    return undefined;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return undefined;
  }
  try {
    return parseCondition(inner);
  } catch (error) {
    if (error instanceof ConditionParseError) {
      return undefined;
    }
    throw error;
  }
}

function extractLeadingCondition(
  line: string
): { leadingCondition?: Condition; remainder: string } {
  const match = line.match(LEADING_CONDITION_REGEX);
  if (!match) {
    return { remainder: line };
  }
  const body = match[1];
  const rest = match[2];
  if (body === undefined || rest === undefined) {
    return { remainder: line };
  }
  if (rest.trim().length === 0) {
    return { remainder: line };
  }
  try {
    const condition = parseCondition(body);
    return { leadingCondition: condition, remainder: rest };
  } catch (error) {
    if (error instanceof ConditionParseError) {
      return { remainder: line };
    }
    throw error;
  }
}

interface InlineSegment {
  kind: 'text' | 'rubric';
  value: string;
}

function segmentInlineRubrics(line: string): InlineSegment[] {
  if (!line.includes('/:')) {
    return [{ kind: 'text', value: line }];
  }
  const segments: InlineSegment[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf('/:', cursor);
    if (start < 0) {
      segments.push({ kind: 'text', value: line.slice(cursor) });
      break;
    }
    if (start > cursor) {
      segments.push({ kind: 'text', value: line.slice(cursor, start) });
    }
    const end = line.indexOf(':/', start + 2);
    if (end < 0) {
      segments.push({ kind: 'text', value: line.slice(start) });
      break;
    }
    const inner = line.slice(start + 2, end).trim();
    segments.push({ kind: 'rubric', value: inner });
    cursor = end + 2;
  }
  return segments
    .map((segment) =>
      segment.kind === 'text'
        ? { kind: 'text' as const, value: segment.value.trim() }
        : segment
    )
    .filter((segment) => !(segment.kind === 'text' && segment.value.length === 0));
}

function isBalancedWrappingParens(input: string): boolean {
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0 && i < input.length - 1) return false;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Canonical section-content builder shared by `parseFile`, cross-reference
 * resolution, and the public `parseDirectiveLines()` helper.
 */
export function buildSectionContentFromLines(lines: readonly string[]): TextContent[] {
  return buildSectionContent(contractTrailingLines(lines));
}

function buildSectionContent(lines: readonly string[]): TextContent[] {
  const out: TextContent[] = [];
  let pendingFollowingCondition: Condition | undefined;

  const appendFollowingBlock = (nodes: TextContent[]): void => {
    if (nodes.length === 0) {
      pendingFollowingCondition = undefined;
      return;
    }
    if (pendingFollowingCondition) {
      const separatorsOnly = nodes.every((node) => node.type === 'separator');
      out.push({
        type: 'conditional',
        condition: pendingFollowingCondition,
        content: nodes,
        scope: DEFAULT_SCOPE
      });
      if (!separatorsOnly) {
        pendingFollowingCondition = undefined;
      }
    } else {
      out.push(...nodes);
    }
  };

  for (const rawLine of lines) {
    const lexed: LexedLine = lexSourceLine(rawLine);

    if (lexed.kind === 'bareMetadata') {
      continue;
    }

    if (lexed.kind === 'bareCondition') {
      applyBareConditionModifier(out, lexed.condition);
      if (shouldApplyToFollowingBlock(lexed.condition)) {
        pendingFollowingCondition = lexed.condition;
      }
      continue;
    }

    const { nodes, leadingCondition } = lexed;
    if (nodes.length === 0 && !leadingCondition) {
      continue;
    }

    const segments = leadingCondition
      ? [
          {
            type: 'conditional' as const,
            condition: leadingCondition,
            content: nodes,
            scope: DEFAULT_SCOPE
          }
        ]
      : nodes;

    appendFollowingBlock(segments);
  }

  return out;
}

function isOmitInstruction(instruction: Condition['instruction']): boolean {
  return instruction === 'omittitur' || instruction === 'omittuntur';
}

function shouldApplyToFollowingBlock(condition: Condition): boolean {
  if (isOmitInstruction(condition.instruction)) {
    return false;
  }

  return (
    condition.stopword === 'sed' ||
    condition.stopword === 'atque' ||
    condition.instruction === 'dicitur' ||
    condition.instruction === 'dicuntur'
  );
}

function applyBareConditionModifier(out: TextContent[], condition: Condition): void {
  if (condition.stopword !== 'sed' && condition.stopword !== 'atque') {
    return;
  }

  const negated: Condition = {
    ...condition,
    expression: { type: 'not', inner: condition.expression }
  };
  delete negated.stopword;
  delete negated.instruction;
  delete negated.instructionModifier;

  const wrapped = wrapTrailingBlock(out, negated);
  if (!wrapped && isOmitInstruction(condition.instruction)) {
    const markerCondition: Condition = {
      ...negated,
      ...(condition.instruction ? { instruction: condition.instruction } : {}),
      ...(condition.instructionModifier ? { instructionModifier: condition.instructionModifier } : {})
    };
    out.push({
      type: 'conditional',
      condition: markerCondition,
      content: [],
      scope: DEFAULT_SCOPE
    });
  }
}

function wrapTrailingBlock(out: TextContent[], condition: Condition): boolean {
  if (out.length === 0) {
    return false;
  }

  let startIndex = out.length;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const node = out[i];
    if (!node) break;
    if (isBlockBoundary(node)) {
      break;
    }
    startIndex = i;
  }

  if (startIndex >= out.length) {
    return false;
  }

  const block = out.slice(startIndex);
  out.length = startIndex;
  out.push({
    type: 'conditional',
    condition,
    content: block,
    scope: DEFAULT_SCOPE
  });
  return true;
}

function isBlockBoundary(node: TextContent): boolean {
  return node.type === 'heading';
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
  const psalmTokenValue = match[2];
  const toneValue = match[3];

  if (antiphonValue === undefined || psalmTokenValue === undefined) {
    throw new DirectiveParseError(`Invalid psalm directive '${line}'.`);
  }

  const antiphon = antiphonValue.trim();
  const psalmToken = psalmTokenValue.trim();
  const psalmTokenMatch = psalmToken.match(/^(\d+)(?:\([^)]+\))?$/u);
  const psalmNumberValue = psalmTokenMatch?.[1];
  if (!psalmNumberValue) {
    throw new DirectiveParseError(`Invalid psalm directive '${line}'.`);
  }
  const tone = toneValue?.trim();
  const parsed: Extract<TextContent, { type: 'psalmRef' }> = {
    type: 'psalmRef',
    psalmNumber: Number(psalmNumberValue)
  };

  if (psalmToken !== psalmNumberValue) {
    parsed.selector = psalmToken;
  }

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

  // `@PATH::sub` (an empty section between two colons before a trailing
  // substitution) carries an empty section name semantically — i.e. the
  // reference inherits the current section. The substitution is already
  // extracted by `extractSubstitutions`, so the residual input collapses to
  // `PATH::` here. Treat the trailing colon-only section as undefined so
  // the reference resolves against the surrounding section name.
  const normalizedSection = section.replace(/^:+/u, '').trim();

  return {
    path: path.length > 0 ? path : undefined,
    section: normalizedSection.length > 0 ? normalizedSection : undefined
  };
}
