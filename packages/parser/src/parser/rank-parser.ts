import { parseCondition } from './condition-parser.js';
import type { Condition } from '../types/conditions.js';
import type { ParsedRankLine } from '../types/rank.js';
import type { Rank } from '../types/schema.js';

export interface RankLineInput {
  text: string;
  lineNumber?: number;
}

export interface ParseRankOptions {
  condition?: Condition;
}

export class RankParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankParseError';
  }
}

export function parseRankLine(line: string, options: ParseRankOptions = {}): ParsedRankLine {
  const parts = line.split(';;').map((segment) => segment.trim());

  if (parts.length < 3) {
    throw new RankParseError(`Rank line must contain at least three fields: '${line}'.`);
  }

  const [title, rankName, weightRaw, derivationRaw] = parts;
  if (!rankName) {
    throw new RankParseError(`Rank line is missing the rank name: '${line}'.`);
  }

  const classWeight = Number(weightRaw);
  if (!Number.isFinite(classWeight)) {
    throw new RankParseError(`Rank class weight must be numeric: '${line}'.`);
  }

  const rank: Rank = {
    name: rankName,
    classWeight,
    derivation: derivationRaw || undefined,
    condition: options.condition
  };

  return {
    title: title ?? '',
    rank,
    raw: line
  };
}

export function parseRankSection(
  lines: RankLineInput[],
  options: ParseRankOptions = {}
): ParsedRankLine[] {
  const parsed: ParsedRankLine[] = [];
  let pendingCondition: Condition | undefined;

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      const expression = trimmed.slice(1, -1).trim();
      if (!expression) {
        throw new RankParseError(
          `Rank condition line at ${line.lineNumber ?? 'unknown line'} is empty.`
        );
      }

      let parsedCondition: Condition;
      try {
        parsedCondition = parseCondition(expression);
      } catch (error) {
        throw new RankParseError(
          `Invalid rank condition at ${line.lineNumber ?? 'unknown line'}: ${expression}`
        );
      }

      pendingCondition = combineConditions(pendingCondition, parsedCondition);
      continue;
    }

    const mergedCondition = combineConditions(options.condition, pendingCondition);
    const rankLine = parseRankLine(line.text, { condition: mergedCondition });
    parsed.push({
      ...rankLine,
      sourceLine: line.lineNumber
    });
    pendingCondition = undefined;
  }

  if (pendingCondition) {
    throw new RankParseError('Rank section ended with a condition line that has no following rank line.');
  }

  return parsed;
}

function combineConditions(left?: Condition, right?: Condition): Condition | undefined {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return {
    expression: {
      type: 'and',
      left: left.expression,
      right: right.expression
    }
  };
}
