import type {
  Condition,
  ConditionExpression,
  InstructionModifier,
  ConditionSubject,
  Instruction,
  ScopeDescriptor,
  Stopword
} from '../types/conditions.js';

const STOPWORDS: Stopword[] = ['si', 'sed', 'vero', 'atque', 'attamen', 'deinde'];
const INSTRUCTIONS: Instruction[] = ['dicitur', 'dicuntur', 'omittitur', 'omittuntur'];
const INSTRUCTION_MODIFIERS: InstructionModifier[] = ['semper'];
const SCOPE_DESCRIPTORS: ScopeDescriptor[] = [
  'loco horum versuum',
  'loco hujus versus',
  'hæc versus',
  'haec versus',
  'hic versus',
  'hoc versus',
  'hi versus'
];
const SUBJECTS: ConditionSubject[] = [
  'rubrica',
  'rubricis',
  'tempore',
  'feria',
  'mense',
  'die',
  'missa',
  'communi',
  'commune',
  'votiva',
  'officio',
  'ad',
  'tonus',
  'toni'
];

const SUBJECT_SET = new Set<string>(SUBJECTS);

export class ConditionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConditionParseError';
  }
}

export function parseCondition(input: string): Condition {
  let text = normalizeWhitespace(input);

  if (!text) {
    throw new ConditionParseError('Condition string is empty.');
  }

  text = stripOuterParentheses(text);

  const extractedInstruction = extractInstructionMetadata(text);
  text = extractedInstruction.remainder;

  const extractedScope = extractTrailingPhrase(text, SCOPE_DESCRIPTORS);
  text = extractedScope.remainder;

  const extractedStopwordPrefix = extractLeadingKeyword(text, STOPWORDS);
  text = extractedStopwordPrefix.remainder;

  let stopword = extractedStopwordPrefix.value;
  if (!stopword) {
    const extractedStopwordSuffix = extractTrailingKeyword(text, STOPWORDS);
    text = extractedStopwordSuffix.remainder;
    stopword = extractedStopwordSuffix.value;
  }

  const expressionSource = stripOuterParentheses(normalizeWhitespace(text));
  if (!expressionSource) {
    throw new ConditionParseError('Condition expression is empty after metadata extraction.');
  }

  const condition: Condition = {
    expression: parseConditionExpression(expressionSource)
  };

  if (stopword) {
    condition.stopword = stopword;
  }

  if (extractedScope.value) {
    condition.scopeDescriptor = extractedScope.value;
  }

  if (extractedInstruction.instruction) {
    condition.instruction = extractedInstruction.instruction;
  }

  if (extractedInstruction.modifier) {
    condition.instructionModifier = extractedInstruction.modifier;
  }

  return condition;
}

export function parseConditionExpression(input: string): ConditionExpression {
  const stream = new TokenStream(tokenize(stripOuterParentheses(normalizeWhitespace(input))));
  const expression = parseOr(stream);

  if (!stream.eof()) {
    throw new ConditionParseError(
      `Unexpected token '${stream.peek() ?? ''}' at the end of condition expression.`
    );
  }

  return expression;
}

function parseOr(stream: TokenStream): ConditionExpression {
  let left = parseAnd(stream);

  while (stream.peekLower() === 'aut') {
    stream.consume();
    const right = parseAnd(stream);
    left = { type: 'or', left, right };
  }

  return left;
}

function parseAnd(stream: TokenStream): ConditionExpression {
  let left = parseUnary(stream);

  while (stream.peekLower() === 'et') {
    stream.consume();
    const right = parseUnary(stream);
    left = { type: 'and', left, right };
  }

  return left;
}

function parseUnary(stream: TokenStream): ConditionExpression {
  if (stream.peekLower() === 'nisi') {
    stream.consume();
    return {
      type: 'not',
      inner: parseUnary(stream)
    };
  }

  return parsePrimary(stream);
}

function parsePrimary(stream: TokenStream): ConditionExpression {
  if (stream.peek() === '(') {
    stream.consume();
    const expression = parseOr(stream);

    if (stream.peek() !== ')') {
      throw new ConditionParseError("Expected ')' while parsing grouped condition.");
    }

    stream.consume();
    return expression;
  }

  return parseMatch(stream);
}

function parseMatch(stream: TokenStream): ConditionExpression {
  const subjectToken = stream.consume();

  if (!subjectToken) {
    throw new ConditionParseError('Unexpected end of input while parsing condition subject.');
  }

  const loweredSubject = subjectToken.toLowerCase();
  if (!SUBJECT_SET.has(loweredSubject)) {
    throw new ConditionParseError(`Unknown condition subject '${subjectToken}'.`);
  }

  const predicateTokens: string[] = [];
  while (!stream.eof()) {
    const token = stream.peek();
    if (!token) {
      break;
    }

    const lowered = token.toLowerCase();
    if (lowered === 'aut' || lowered === 'et' || token === ')') {
      break;
    }

    predicateTokens.push(stream.consume() as string);
  }

  if (predicateTokens.length === 0) {
    throw new ConditionParseError(`Condition subject '${subjectToken}' is missing its predicate.`);
  }

  return {
    type: 'match',
    subject: loweredSubject as ConditionSubject,
    predicate: predicateTokens.join(' ')
  };
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function stripOuterParentheses(input: string): string {
  let value = input.trim();

  while (value.startsWith('(') && value.endsWith(')')) {
    if (!isFullyWrappedByParentheses(value)) {
      break;
    }

    value = value.slice(1, -1).trim();
  }

  return value;
}

function isFullyWrappedByParentheses(input: string): boolean {
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0 && i < input.length - 1) {
        return false;
      }
      if (depth < 0) {
        return false;
      }
    }
  }

  return depth === 0;
}

function extractLeadingKeyword<T extends string>(
  input: string,
  keywords: readonly T[]
): { remainder: string; value?: T } {
  const trimmed = normalizeWhitespace(input);

  for (const keyword of keywords) {
    const regex = new RegExp(`^${escapeRegex(keyword)}\\b(?:[,;:]\\s*)?`, 'i');
    const match = trimmed.match(regex);
    if (!match) {
      continue;
    }

    return {
      remainder: normalizeWhitespace(trimmed.slice(match[0].length)),
      value: keyword
    };
  }

  return { remainder: trimmed };
}

function extractTrailingKeyword<T extends string>(
  input: string,
  keywords: readonly T[]
): { remainder: string; value?: T } {
  const trimmed = normalizeWhitespace(input);

  for (const keyword of keywords) {
    const regex = new RegExp(`(?:[,;:]\\s*)?\\b${escapeRegex(keyword)}\\b$`, 'i');
    const match = trimmed.match(regex);
    if (!match) {
      continue;
    }

    return {
      remainder: normalizeWhitespace(trimmed.slice(0, match.index)),
      value: keyword
    };
  }

  return { remainder: trimmed };
}

function extractTrailingPhrase<T extends string>(
  input: string,
  phrases: readonly T[]
): { remainder: string; value?: T } {
  const trimmed = normalizeWhitespace(input);
  const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);
  const loweredInput = trimmed.toLowerCase();

  for (const phrase of sortedPhrases) {
    const loweredPhrase = phrase.toLowerCase();
    if (!loweredInput.endsWith(loweredPhrase)) {
      continue;
    }

    const start = loweredInput.length - loweredPhrase.length;
    const precedingChar = start > 0 ? loweredInput[start - 1] : undefined;
    if (precedingChar && /[\p{L}\p{N}]/u.test(precedingChar)) {
      continue;
    }

    let remainder = trimmed.slice(0, start).trimEnd();
    remainder = remainder.replace(/[,:;]+\s*$/u, '');

    return {
      remainder: normalizeWhitespace(remainder),
      value: phrase
    };
  }

  return { remainder: trimmed };
}

function extractInstructionMetadata(input: string): {
  remainder: string;
  instruction?: Instruction;
  modifier?: InstructionModifier;
} {
  const trimmed = normalizeWhitespace(input);
  const lowered = trimmed.toLowerCase();

  for (const instruction of INSTRUCTIONS) {
    for (const modifier of INSTRUCTION_MODIFIERS) {
      const suffix = ` ${instruction} ${modifier}`;
      if (lowered.endsWith(suffix)) {
        return {
          remainder: cleanTrailingPunctuation(
            normalizeWhitespace(trimmed.slice(0, trimmed.length - suffix.length))
          ),
          instruction,
          modifier
        };
      }

      const prefixModifier = ` ${modifier} ${instruction}`;
      if (lowered.endsWith(prefixModifier)) {
        return {
          remainder: cleanTrailingPunctuation(
            normalizeWhitespace(trimmed.slice(0, trimmed.length - prefixModifier.length))
          ),
          instruction,
          modifier
        };
      }
    }

    const instructionOnly = ` ${instruction}`;
    if (lowered.endsWith(instructionOnly)) {
      return {
        remainder: cleanTrailingPunctuation(
          normalizeWhitespace(trimmed.slice(0, trimmed.length - instructionOnly.length))
        ),
        instruction
      };
    }

    if (lowered === instruction) {
      return {
        remainder: '',
        instruction
      };
    }
  }

  return {
    remainder: trimmed
  };
}

function cleanTrailingPunctuation(input: string): string {
  return input.replace(/[,:;]+$/u, '').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (const char of input) {
    if (char === '(' || char === ')') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }

    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

class TokenStream {
  private readonly tokens: string[];
  private cursor = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  peek(): string | undefined {
    return this.tokens[this.cursor];
  }

  peekLower(): string | undefined {
    return this.peek()?.toLowerCase();
  }

  consume(): string | undefined {
    const token = this.tokens[this.cursor];
    this.cursor += 1;
    return token;
  }

  eof(): boolean {
    return this.cursor >= this.tokens.length;
  }
}
