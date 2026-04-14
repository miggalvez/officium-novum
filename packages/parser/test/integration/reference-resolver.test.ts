import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FsFileLoader } from '../../src/corpus/file-loader.js';
import { FileCache } from '../../src/resolver/file-cache.js';
import { CrossReferenceResolver } from '../../src/resolver/reference-resolver.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

describeIfUpstream('CrossReferenceResolver integration', () => {
  it('resolves real references from Sancti/01-25', async () => {
    const cache = new FileCache(new FsFileLoader(UPSTREAM_ROOT));
    const resolver = new CrossReferenceResolver(cache, {
      domain: 'horas',
      language: 'Latin'
    });

    const resolved = await resolver.resolveFile(await cache.get('horas/Latin/Sancti/01-25.txt'));
    const responsory = resolved.sections.find((section) => section.header === 'Responsory1');

    expect(responsory).toBeDefined();
    expect(responsory?.content.length ?? 0).toBeGreaterThan(0);
    expect(responsory?.content.some((line) => line.type === 'reference')).toBe(false);
    expect(responsory?.content[0]).toMatchObject({ type: 'verseMarker', marker: 'R.' });
  });

  it('resolves preamble merges for monastic Advent files', async () => {
    const cache = new FileCache(new FsFileLoader(UPSTREAM_ROOT));
    const resolver = new CrossReferenceResolver(cache, {
      domain: 'horas',
      language: 'Latin'
    });

    const resolved = await resolver.resolveFile(await cache.get('horas/Latin/TemporaM/Adv1-0.txt'));

    expect(resolved.sections.map((section) => section.header)).not.toContain('__preamble');
    expect(resolved.sections.some((section) => section.header === 'Officium')).toBe(true);
    expect(resolved.sections.some((section) => section.header === 'Rank')).toBe(true);

    const ruleSection = resolved.sections.find((section) => section.header === 'Rule');
    expect(ruleSection?.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'action', keyword: '12' })])
    );

    const lectio1 = resolved.sections.find((section) => section.header === 'Lectio1');
    expect(lectio1?.content.some((line) => line.type === 'reference')).toBe(false);
    expect(lectio1?.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'text', value: 'Incipit liber Isaíæ Prophétæ' })])
    );
  });

  it('collects warnings as an array', async () => {
    const cache = new FileCache(new FsFileLoader(UPSTREAM_ROOT));
    const resolver = new CrossReferenceResolver(cache, {
      domain: 'horas',
      language: 'Latin'
    });

    await resolver.resolveFile(await cache.get('horas/Latin/Sancti/01-25.txt'));

    expect(Array.isArray(resolver.warnings)).toBe(true);
  });
});
