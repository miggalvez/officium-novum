import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadApiConfig } from '../src/config.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');

describe('config', () => {
  it('defaults corpusPath to the repository upstream corpus independently of cwd', () => {
    const config = loadApiConfig({});

    expect(config.corpusPath).toBe(resolve(REPOSITORY_ROOT, 'upstream/web/www'));
  });

  it('parses logger configuration explicitly', () => {
    expect(loadApiConfig({ OFFICIUM_API_LOGGER: 'true' }).logger).toBe(true);
    expect(loadApiConfig({ OFFICIUM_API_LOGGER: '0' }).logger).toBe(false);
    expect(() => loadApiConfig({ OFFICIUM_API_LOGGER: 'yes' })).toThrow(
      'Invalid OFFICIUM_API_LOGGER: yes'
    );
  });
});
