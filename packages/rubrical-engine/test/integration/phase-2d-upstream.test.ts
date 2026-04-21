import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus } from '@officium-novum/parser';
import { describe, expect, it } from 'vitest';
import type { ParsedFile } from '@officium-novum/parser';

import {
  asVersionHandle,
  buildCelebrationRuleSet,
  rubrics1960Policy,
  type ResolvedVersion,
  type RuleEvaluationContext
} from '../../src/index.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PACKAGE_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

const EXPECTED_UNMAPPED_TOTAL = 279;
const EXPECTED_MISSA_PASSTHROUGH_TOTAL = 470;

describeIfUpstream('Phase 2d upstream rule evaluation invariants', () => {
  it('builds rule sets for every Sancti/Tempora file with [Rule] and tracks baseline counts', async () => {
    const corpus = await loadCorpus(UPSTREAM_ROOT, {
      resolveReferences: false
    });

    const version: ResolvedVersion = {
      handle: asVersionHandle('Rubrics 1960 - 1960'),
      kalendar: '1960',
      transfer: '1960',
      stransfer: '1960',
      policy: rubrics1960Policy
    };

    let unmappedTotal = 0;
    let missaPassthroughTotal = 0;

    const feastPaths = [
      ...collectFeastFiles('horas/Latin/Sancti'),
      ...collectFeastFiles('horas/Latin/Tempora')
    ];

    for (const path of feastPaths) {
      const file = corpus.index.getFile(path);
      if (!file) {
        continue;
      }

      if (!hasRuleSection(file)) {
        continue;
      }

      const canonicalPath = path.slice('horas/Latin/'.length, -'.txt'.length);
      const context: RuleEvaluationContext = {
        date: { year: 2024, month: 1, day: 1 },
        dayOfWeek: 1,
        season: 'christmastide',
        version,
        dayName: 'Nat1-1',
        celebration: {
          feastRef: {
            path: canonicalPath,
            id: canonicalPath,
            title: canonicalPath
          },
          rank: {
            name: 'II classis',
            classSymbol: 'II',
            weight: 900
          },
          source: canonicalPath.startsWith('Tempora/') ? 'temporal' : 'sanctoral'
        },
        commemorations: [],
        corpus: corpus.index
      };

      const evaluation = buildCelebrationRuleSet(file, [], context);
      const ruleSet = evaluation.celebrationRules;

      expect([3, 9, 12]).toContain(ruleSet.matins.lessonCount);
      expect([1, 3]).toContain(ruleSet.matins.nocturns);
      expect(typeof ruleSet.hasFirstVespers).toBe('boolean');
      expect(typeof ruleSet.hasSecondVespers).toBe('boolean');
      expect(Array.isArray(ruleSet.lessonSources)).toBe(true);
      expect(Array.isArray(ruleSet.lessonSetAlternates)).toBe(true);
      expect(Array.isArray(ruleSet.hourScopedDirectives)).toBe(true);

      unmappedTotal += ruleSet.unmapped.length;
      missaPassthroughTotal += evaluation.warnings.filter(
        (warning) => warning.code === 'rule-missa-passthrough'
      ).length;
    }

    expect(unmappedTotal).toBe(EXPECTED_UNMAPPED_TOTAL);
    expect(missaPassthroughTotal).toBe(EXPECTED_MISSA_PASSTHROUGH_TOTAL);
  }, 180_000);
});

function collectFeastFiles(rootRelative: string): readonly string[] {
  const rootAbsolute = resolve(UPSTREAM_ROOT, rootRelative);
  const output: string[] = [];

  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir)) {
      const absolutePath = resolve(dir, name);
      const relativePath = `${prefix}/${name}`;
      if (name.endsWith('.txt')) {
        output.push(relativePath);
        continue;
      }

      if (!name.includes('.')) {
        walk(absolutePath, relativePath);
      }
    }
  };

  walk(rootAbsolute, rootRelative);
  return output;
}

function hasRuleSection(file: ParsedFile): boolean {
  return file.sections.some((section) => section.header === 'Rule' && (section.rules?.length ?? 0) > 0);
}
