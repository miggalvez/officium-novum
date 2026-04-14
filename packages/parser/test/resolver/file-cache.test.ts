import { describe, expect, it } from 'vitest';

import type { FileLoader } from '../../src/corpus/file-loader.js';
import { FileCache } from '../../src/resolver/file-cache.js';
import { loadFixture } from '../fixture-loader.js';

class MockFileLoader implements FileLoader {
  readonly calls: string[] = [];

  private readonly files: Record<string, string>;

  constructor(files: Record<string, string>) {
    this.files = files;
  }

  async load(relativePath: string): Promise<string> {
    this.calls.push(relativePath);

    if (relativePath in this.files) {
      return this.files[relativePath] ?? '';
    }

    const error = new Error(`Corpus file not found: ${relativePath}`) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
}

describe('FileCache', () => {
  it('loads and parses a fixture file', async () => {
    const loader = new MockFileLoader({
      'preamble-base.txt': await loadFixture('preamble-base.txt')
    });
    const cache = new FileCache(loader);

    const parsed = await cache.get('preamble-base.txt');

    expect(parsed.path).toBe('preamble-base.txt');
    expect(parsed.sections.map((section) => section.header)).toEqual([
      'Officium',
      'Rank',
      'Oratio',
      'Ant Vespera'
    ]);
  });

  it('returns the same cached object on repeated get', async () => {
    const loader = new MockFileLoader({
      'preamble-base.txt': await loadFixture('preamble-base.txt')
    });
    const cache = new FileCache(loader);

    const first = await cache.get('preamble-base.txt');
    const second = await cache.get('./preamble-base.txt');

    expect(first).toBe(second);
    expect(loader.calls.filter((path) => path === 'preamble-base.txt')).toHaveLength(1);
  });

  it('throws a descriptive error for missing files', async () => {
    const cache = new FileCache(new MockFileLoader({}));

    await expect(cache.get('does-not-exist.txt')).rejects.toThrow(/Corpus file not found/iu);
  });

  it('reports file existence with has', async () => {
    const cache = new FileCache(
      new MockFileLoader({
        'reference-chain-a.txt': await loadFixture('reference-chain-a.txt')
      })
    );

    await expect(cache.has('reference-chain-a.txt')).resolves.toBe(true);
    await expect(cache.has('missing.txt')).resolves.toBe(false);
  });
});
