import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { CorpusFile } from '../../src/corpus/corpus-walker.js';
import { FsCorpusWalker } from '../../src/corpus/corpus-walker.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('FsCorpusWalker integration', () => {
  it('walks and emits corpus metadata for text files', async () => {
    const walker = new FsCorpusWalker();
    const files: CorpusFile[] = [];

    for await (const entry of walker.walk(UPSTREAM_ROOT)) {
      files.push(entry);
      if (files.length >= 100) {
        break;
      }
    }

    expect(files).toHaveLength(100);
    expect(files.every((file) => file.relativePath.length > 0)).toBe(true);
    expect(files.every((file) => file.language.length > 0)).toBe(true);
    expect(files.every((file) => file.domain.length > 0)).toBe(true);
    expect(files.every((file) => file.contentDir.length > 0)).toBe(true);

    expect(files.some((file) => file.rite === 'M')).toBe(true);
    expect(files.some((file) => file.rite === 'OP')).toBe(true);

    expect(files.some((file) => file.relativePath === 'horas/Latin/Sancti/01-25.txt')).toBe(true);
  });
});
