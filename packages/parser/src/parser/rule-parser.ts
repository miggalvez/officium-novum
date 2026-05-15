import { parseCondition } from './condition-parser.js';
import { parseCrossReference } from './directive-parser.js';
import type { Condition } from '../types/conditions.js';
import type { RuleDirective } from '../types/directives.js';

export interface RuleLineInput {
  text: string;
  lineNumber?: number;
}

export class RuleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleParseError';
  }
}

export function parseRuleLine(line: string): RuleDirective | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const withPrefixCondition = extractLeadingCondition(trimmed);
  let body = withPrefixCondition.remainder;
  let condition = withPrefixCondition.condition;

  if (!condition) {
    const withSuffixCondition = extractTrailingCondition(trimmed);
    body = withSuffixCondition.remainder;
    condition = withSuffixCondition.condition;
  }

  if (body.startsWith('@')) {
    return {
      kind: 'reference',
      reference: parseCrossReference(body),
      condition,
      raw: trimmed
    };
  }

  const assignmentMatch = body.match(/^([\p{L}\p{N}_.-]+)\s*=\s*(.+)$/u);
  if (assignmentMatch) {
    const key = assignmentMatch[1];
    const value = assignmentMatch[2];

    if (!key || value === undefined) {
      throw new RuleParseError(`Invalid assignment rule '${line}'.`);
    }

    return {
      kind: 'assignment',
      key,
      value,
      condition,
      raw: trimmed
    };
  }

  const parts = body.split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const keyword = parts[0];
  if (!keyword) {
    return null;
  }

  const args = parts.slice(1);

  return {
    kind: 'action',
    keyword,
    args,
    condition,
    raw: trimmed
  };
}

export function parseRuleSection(lines: RuleLineInput[]): RuleDirective[] {
  const directives: RuleDirective[] = [];
  let pendingCondition: Condition | undefined;

  for (const line of lines) {
    const conditionOnly = parseConditionOnlyLine(line.text);
    if (conditionOnly) {
      pendingCondition = pendingCondition
        ? combineConditions(pendingCondition, conditionOnly)
        : conditionOnly;
      continue;
    }

    const directive = parseRuleLine(line.text);
    if (!directive) {
      continue;
    }

    if (pendingCondition) {
      directives.push({
        ...directive,
        condition: directive.condition
          ? combineConditions(pendingCondition, directive.condition)
          : pendingCondition
      });
      pendingCondition = undefined;
      continue;
    }

    directives.push(directive);
  }

  return directives;
}

function parseConditionOnlyLine(line: string): Condition | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('(')) {
    return undefined;
  }

  const closingIndex = findMatchingClosingParen(trimmed, 0);
  if (closingIndex < 0) {
    return undefined;
  }

  const suffix = trimmed.slice(closingIndex + 1).trim();
  if (suffix && !suffix.startsWith('#')) {
    return undefined;
  }

  try {
    return parseCondition(trimmed.slice(1, closingIndex).trim());
  } catch {
    return undefined;
  }
}

function combineConditions(left: Condition, right: Condition): Condition {
  return {
    ...left,
    expression: {
      type: 'and',
      left: left.expression,
      right: right.expression
    }
  };
}

function extractLeadingCondition(input: string): { remainder: string; condition?: Condition } {
  if (!input.startsWith('(')) {
    return { remainder: input };
  }

  const closingIndex = findMatchingClosingParen(input, 0);
  if (closingIndex < 0) {
    return { remainder: input };
  }

  const candidate = input.slice(1, closingIndex).trim();
  const remainder = input.slice(closingIndex + 1).trim();

  if (!candidate || !remainder) {
    return { remainder: input };
  }

  try {
    return {
      remainder,
      condition: parseCondition(candidate)
    };
  } catch {
    return { remainder: input };
  }
}

function extractTrailingCondition(input: string): { remainder: string; condition?: Condition } {
  if (!input.endsWith(')')) {
    return { remainder: input };
  }

  let depth = 0;
  for (let idx = input.length - 1; idx >= 0; idx -= 1) {
    const char = input[idx];

    if (char === ')') {
      depth += 1;
    } else if (char === '(') {
      depth -= 1;
      if (depth === 0) {
        const precedingChar = idx > 0 ? input[idx - 1] : undefined;
        if (precedingChar && !/\s/u.test(precedingChar)) {
          return { remainder: input };
        }

        const candidate = input.slice(idx + 1, -1).trim();
        const remainder = input.slice(0, idx).trim();

        if (!candidate || !remainder) {
          return { remainder: input };
        }

        try {
          return {
            remainder,
            condition: parseCondition(candidate)
          };
        } catch {
          return { remainder: input };
        }
      }
    }
  }

  return { remainder: input };
}

function findMatchingClosingParen(input: string, openingIndex: number): number {
  let depth = 0;

  for (let idx = openingIndex; idx < input.length; idx += 1) {
    if (input[idx] === '(') {
      depth += 1;
    } else if (input[idx] === ')') {
      depth -= 1;
      if (depth === 0) {
        return idx;
      }
      if (depth < 0) {
        return -1;
      }
    }
  }

  return -1;
}
