import { describe, expect, it } from 'vitest';

import { ConditionParseError, parseCondition, parseConditionExpression } from '../src/parser/condition-parser.js';

describe('parseConditionExpression', () => {
  it('applies et before aut precedence', () => {
    const parsed = parseConditionExpression('rubrica 1960 et tempore paschali aut missa votiva');

    expect(parsed).toEqual({
      type: 'or',
      left: {
        type: 'and',
        left: { type: 'match', subject: 'rubrica', predicate: '1960' },
        right: { type: 'match', subject: 'tempore', predicate: 'paschali' }
      },
      right: { type: 'match', subject: 'missa', predicate: 'votiva' }
    });
  });

  it('parses nested groups and nisi negations', () => {
    const parsed = parseConditionExpression(
      '(rubrica 1960 aut tempore adventus) et nisi missa votiva'
    );

    expect(parsed).toMatchSnapshot();
  });

  it('throws for unknown subjects', () => {
    expect(() => parseConditionExpression('foobar 1960')).toThrowError(ConditionParseError);
  });

  it('accepts rubricis as an alias subject', () => {
    expect(parseConditionExpression('rubricis 1960')).toEqual({
      type: 'match',
      subject: 'rubricis',
      predicate: '1960'
    });
  });
});

describe('parseCondition', () => {
  it('extracts stopword, scope descriptor, and instruction metadata', () => {
    const parsed = parseCondition('si rubrica 1960 loco hujus versus dicitur');

    expect(parsed.stopword).toBe('si');
    expect(parsed.scopeDescriptor).toBe('loco hujus versus');
    expect(parsed.instruction).toBe('dicitur');
    expect(parsed.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: '1960'
    });
  });

  it('supports suffix stopwords and whitespace normalization', () => {
    const parsed = parseCondition('  rubrica 1960   sed ');

    expect(parsed.stopword).toBe('sed');
    expect(parsed.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: '1960'
    });
  });

  it('parses semper modifier with instruction metadata', () => {
    const one = parseCondition('rubrica 1960 dicitur semper');
    expect(one.instruction).toBe('dicitur');
    expect(one.instructionModifier).toBe('semper');

    const two = parseCondition('rubrica 1960 semper dicitur');
    expect(two.instruction).toBe('dicitur');
    expect(two.instructionModifier).toBe('semper');
  });
});
