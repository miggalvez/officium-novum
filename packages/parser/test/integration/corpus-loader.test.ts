import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadCorpus } from '../../src/corpus/corpus-loader.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('loadCorpus integration', () => {
  it(
    'loads the corpus into an index and reports recoverable errors',
    async () => {
      const result = await loadCorpus(UPSTREAM_ROOT);
      const errorRatio = result.fileCount === 0 ? 0 : result.errors.length / result.fileCount;

      expect(result.fileCount).toBeGreaterThan(30_000);
      expect(errorRatio).toBeLessThan(0.05);
      expect(result.warningCount).toBeGreaterThanOrEqual(0);

      const target = result.index.getFile('horas/Latin/Sancti/01-25.txt');
      expect(target).toBeDefined();

      const rank = result.index.getSection('horas/Latin/Sancti/01-25.txt', 'Rank');
      expect(rank?.rank?.length ?? 0).toBeGreaterThan(0);

      const responsory = result.index.getSection('horas/Latin/Sancti/01-25.txt', 'Responsory1');
      expect(responsory?.content.some((line) => line.type === 'reference')).toBe(false);

      const matches = result.index.findByContentPath('Sancti/01-25.txt');
      expect(matches.length).toBeGreaterThan(1);

      const languages = new Set(matches.map((file) => file.path.split('/')[1] ?? ''));
      expect(languages.size).toBeGreaterThan(1);
    },
    120_000
  );
});
