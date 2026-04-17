import { parseFile } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';

import { resolveEx, resolveVide } from '../../src/rules/resolve-vide-ex.js';
import { asVersionHandle, type RuleEvaluationContext, type ResolvedVersion } from '../../src/index.js';
import { makeTestPolicy } from '../policy-fixture.js';
import { TestOfficeTextIndex } from '../helpers.js';

describe('resolve-vide-ex', () => {
  it('resolves ex chains and returns inherited directives', () => {
    const corpus = new TestOfficeTextIndex();
    const feast = addRuleFile(corpus, 'horas/Latin/Sancti/12-26.txt', ['ex Sancti/12-25m3;']);
    addRuleFile(corpus, 'horas/Latin/Sancti/12-25m3.txt', ['9 lectiones', 'Doxology=Nat']);

    const result = resolveEx(feast, makeContext(corpus));

    expect(result.warnings).toEqual([]);
    expect(result.directives.map((directive) => directive.raw)).toEqual(
      expect.arrayContaining(['9 lectiones', 'Doxology=Nat'])
    );
  });

  it('resolves vide chains as selective fallback', () => {
    const corpus = new TestOfficeTextIndex();
    const feast = addRuleFile(corpus, 'horas/Latin/Sancti/01-02.txt', ['vide Sancti/01-01', '9 lectiones']);
    addRuleFile(corpus, 'horas/Latin/Sancti/01-01.txt', ['9 lectiones', 'Doxology=Nat']);

    const own = feast.sections.find((section) => section.header === 'Rule')?.rules ?? [];
    const ownWithoutRefs = own.filter(
      (directive) => directive.kind !== 'action' || !['vide', 'ex'].includes(directive.keyword)
    );

    const result = resolveVide(feast, ownWithoutRefs, makeContext(corpus));

    expect(result.warnings).toEqual([]);
    expect(result.directives.map((directive) => directive.raw)).toEqual(['Doxology=Nat']);
  });

  it('preserves vide modifiers in warning context', () => {
    const corpus = new TestOfficeTextIndex();
    const feast = addRuleFile(corpus, 'horas/Latin/Sancti/04-28.txt', ['vide C4a;mtv']);

    const result = resolveVide(feast, [], makeContext(corpus));

    expect(result.directives).toEqual([]);
    expect(result.warnings[0]).toMatchObject({
      code: 'rule-vide-target-missing',
      context: {
        modifier: 'mtv'
      }
    });
  });

  it('emits missing-target warnings', () => {
    const corpus = new TestOfficeTextIndex();
    const feast = addRuleFile(corpus, 'horas/Latin/Sancti/10-10.txt', ['ex Sancti/does-not-exist']);

    const result = resolveEx(feast, makeContext(corpus));

    expect(result.directives).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('rule-ex-target-missing');
  });

  it('detects cycles without infinite recursion', () => {
    const corpus = new TestOfficeTextIndex();
    const feastA = addRuleFile(corpus, 'horas/Latin/Sancti/A.txt', ['ex Sancti/B']);
    addRuleFile(corpus, 'horas/Latin/Sancti/B.txt', ['ex Sancti/A', 'Doxology=Nat']);

    const result = resolveEx(feastA, makeContext(corpus));

    expect(result.warnings.some((warning) => warning.code === 'rule-ex-cycle')).toBe(true);
    expect(result.directives.map((directive) => directive.raw)).toContain('Doxology=Nat');
  });

  it('emits a warning when chain depth exceeds ten levels', () => {
    const corpus = new TestOfficeTextIndex();

    for (let index = 0; index <= 11; index += 1) {
      const current = `horas/Latin/Sancti/Depth-${index}.txt`;
      const next = `Sancti/Depth-${index + 1}`;
      const lines = index === 11 ? ['9 lectiones'] : [`ex ${next}`];
      addRuleFile(corpus, current, lines);
    }

    const feast = parseFile('[Rule]\nex Sancti/Depth-0\n', 'horas/Latin/Sancti/Root.txt');
    corpus.add(feast.path, '[Rule]\nex Sancti/Depth-0\n');

    const result = resolveEx(feast, makeContext(corpus));

    expect(result.warnings.some((warning) => warning.code === 'rule-ex-cycle')).toBe(true);
  });
});

function addRuleFile(corpus: TestOfficeTextIndex, path: string, rules: readonly string[]) {
  const content = ['[Rule]', ...rules].join('\n');
  corpus.add(path, content);
  return parseFile(content, path);
}

function makeContext(corpus: TestOfficeTextIndex): RuleEvaluationContext {
  const policy = makeTestPolicy('rubrics-1960');
  const version: ResolvedVersion = {
    handle: asVersionHandle('Rubrics 1960 - 1960'),
    kalendar: '1960',
    transfer: '1960',
    stransfer: '1960',
    policy
  };

  return {
    date: { year: 2024, month: 4, day: 14 },
    dayOfWeek: 0,
    season: 'eastertide',
    version,
    dayName: 'Pasc2-0',
    celebration: {
      feastRef: {
        path: 'Tempora/Pasc2-0',
        id: 'Tempora/Pasc2-0',
        title: 'Dominica II post Pascha'
      },
      rank: {
        name: 'I classis',
        classSymbol: 'I',
        weight: 1000
      },
      source: 'temporal'
    },
    commemorations: [],
    corpus
  };
}
