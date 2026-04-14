import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseFile } from '../../src/parser/parse-file.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('parseFile integration', () => {
  it('parses Sancti/01-25 with rank, rule, and formula directives', async () => {
    const relativePath = 'horas/Latin/Sancti/01-25.txt';
    const content = await readFile(resolve(UPSTREAM_ROOT, relativePath), 'utf8');
    const parsed = parseFile(content, relativePath);

    expect(parsed.sections).toHaveLength(30);

    const rankSection = parsed.sections.find((section) => section.header === 'Rank');
    expect(rankSection?.rank).toHaveLength(3);
    expect(rankSection?.rank?.[1]?.rank.condition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: 'innovata'
    });
    expect(rankSection?.rank?.[2]?.rank.condition?.expression).toEqual({
      type: 'match',
      subject: 'rubrica',
      predicate: 'cisterciensis'
    });

    const ruleSection = parsed.sections.find((section) => section.header === 'Rule');
    expect(ruleSection?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'action', keyword: 'ex' }),
        expect.objectContaining({ kind: 'action', keyword: '9' }),
        expect.objectContaining({
          kind: 'assignment',
          key: 'Psalm5Vespera',
          value: '116'
        })
      ])
    );

    const oratioSection = parsed.sections.find((section) => section.header === 'Oratio');
    expect(oratioSection?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'formulaRef',
          name: 'Per Dominum'
        })
      ])
    );
  });

  it('parses Tempora/Pasc0-0 without errors', async () => {
    const relativePath = 'horas/Latin/Tempora/Pasc0-0.txt';
    const content = await readFile(resolve(UPSTREAM_ROOT, relativePath), 'utf8');
    const parsed = parseFile(content, relativePath);

    expect(parsed.sections.length).toBeGreaterThanOrEqual(5);
  });
});
