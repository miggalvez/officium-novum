import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseKalendarium } from '../../src/calendar/kalendarium.js';
import { parseVersionRegistry } from '../../src/calendar/version-registry.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('calendar integration', () => {
  it('parses Tabulae/data.txt and contains key versions', async () => {
    const content = await readFile(resolve(UPSTREAM_ROOT, 'Tabulae/data.txt'), 'utf8');
    const parsed = parseVersionRegistry(content);

    expect(parsed.some((entry) => entry.version === 'Rubrics 1960 - 1960')).toBe(true);
    expect(parsed.some((entry) => entry.version === 'Tridentine - 1570')).toBe(true);
    expect(parsed.some((entry) => entry.version === 'Monastic - 1963')).toBe(true);

    const rubrics1960 = parsed.find((entry) => entry.version === 'Rubrics 1960 - 1960');
    expect(rubrics1960?.base).toBe('Reduced - 1955');
  });

  it('parses Tabulae/Kalendaria/1960.txt and tracks suppressed days', async () => {
    const content = await readFile(resolve(UPSTREAM_ROOT, 'Tabulae/Kalendaria/1960.txt'), 'utf8');
    const parsed = parseKalendarium(content);

    expect(parsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateKey: '01-25',
          fileRef: '01-25r'
        }),
        expect.objectContaining({
          dateKey: '05-06',
          suppressed: true
        })
      ])
    );
  });
});
