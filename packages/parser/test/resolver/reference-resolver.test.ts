import { describe, expect, it } from 'vitest';

import type { FileLoader } from '../../src/corpus/file-loader.js';
import { parseFile } from '../../src/parser/parse-file.js';
import { parseCrossReference } from '../../src/parser/directive-parser.js';
import { FileCache } from '../../src/resolver/file-cache.js';
import {
  CrossReferenceResolver,
  type PathResolver,
  type ResolveContext
} from '../../src/resolver/reference-resolver.js';
import type { TextContent } from '../../src/types/schema.js';
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

const identityPathResolver: PathResolver = (referencePath) => [
  referencePath.toLowerCase().endsWith('.txt') ? referencePath : `${referencePath}.txt`
];

async function createResolver(extraFiles: Record<string, string> = {}): Promise<{
  resolver: CrossReferenceResolver;
  cache: FileCache;
  loader: MockFileLoader;
}> {
  const files: Record<string, string> = {
    'preamble-base.txt': await loadFixture('preamble-base.txt'),
    'preamble-overlay.txt': await loadFixture('preamble-overlay.txt'),
    'reference-chain-a.txt': await loadFixture('reference-chain-a.txt'),
    'reference-chain-b.txt': await loadFixture('reference-chain-b.txt'),
    'reference-cycle-a.txt': await loadFixture('reference-cycle-a.txt'),
    'reference-cycle-b.txt': await loadFixture('reference-cycle-b.txt'),
    'reference-with-selector.txt': await loadFixture('reference-with-selector.txt'),
    ...extraFiles
  };

  const loader = new MockFileLoader(files);
  const cache = new FileCache(loader);
  const resolver = new CrossReferenceResolver(cache, {
    domain: 'horas',
    language: 'Latin',
    pathResolver: identityPathResolver
  });

  return { resolver, cache, loader };
}

function baseContext(sourceFile: string, sectionName: string): ResolveContext {
  return {
    sourceFile,
    currentSection: sectionName,
    visited: new Set(),
    depth: 0
  };
}

function extractText(lines: readonly TextContent[]): string[] {
  return lines
    .filter((line): line is Extract<TextContent, { type: 'text' }> => line.type === 'text')
    .map((line) => line.value);
}

describe('CrossReferenceResolver', () => {
  it('resolves a basic cross-reference to section content', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-chain-b:Oratio'),
      baseContext('reference-chain-a.txt', 'Oratio')
    );

    expect(resolved).toEqual([
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Deus, qui omnipotentiam tuam parcendo maxime manifestas.'
      },
      {
        type: 'formulaRef',
        name: 'Per Dominum'
      }
    ]);
  });

  it('resolves chained references across files', async () => {
    const { resolver, cache } = await createResolver();

    const resolved = await resolver.resolveFile(await cache.get('reference-chain-a.txt'));
    const oratio = resolved.sections.find((section) => section.header === 'Oratio');

    expect(oratio?.content).toEqual([
      {
        type: 'verseMarker',
        marker: 'v.',
        text: 'Deus, qui omnipotentiam tuam parcendo maxime manifestas.'
      },
      {
        type: 'formulaRef',
        name: 'Per Dominum'
      }
    ]);
  });

  it('detects cycles and emits warnings', async () => {
    const { resolver, cache } = await createResolver();

    const resolved = await resolver.resolveFile(await cache.get('reference-cycle-a.txt'));
    const oratio = resolved.sections.find((section) => section.header === 'Oratio');

    expect(oratio?.content).toEqual([]);
    expect(resolver.warnings.some((warning) => warning.type === 'cycle-detected')).toBe(true);
  });

  it('applies line selector ranges before parsing', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-with-selector:Lectio1:2-4'),
      baseContext('reference-chain-a.txt', 'Lectio1')
    );

    expect(extractText(resolved)).toEqual([
      'Line two of the reading.',
      'Line three of the reading.',
      'Line four of the reading.'
    ]);
  });

  it('applies inverse line selectors', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-with-selector:Lectio1:!2-3'),
      baseContext('reference-chain-a.txt', 'Lectio1')
    );

    expect(extractText(resolved)).toEqual([
      'Line one of the reading.',
      'Line four of the reading.',
      'Line five of the reading.'
    ]);
  });

  it('applies substitutions before parsing', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-with-selector:Lectio1:s/reading/lesson/g'),
      baseContext('reference-chain-a.txt', 'Lectio1')
    );

    expect(extractText(resolved)).toEqual([
      'Line one of the lesson.',
      'Line two of the lesson.',
      'Line three of the lesson.',
      'Line four of the lesson.',
      'Line five of the lesson.'
    ]);
  });

  it('applies chained substitutions in order', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-with-selector:Lectio1:2-2 s/Line/Verse/g s/reading/lesson/g'),
      baseContext('reference-chain-a.txt', 'Lectio1')
    );

    expect(extractText(resolved)).toEqual(['Verse two of the lesson.']);
  });

  it('returns empty content and warning for missing sections', async () => {
    const { resolver } = await createResolver();

    const resolved = await resolver.resolve(
      parseCrossReference('@reference-chain-b:MissingSection'),
      baseContext('reference-chain-a.txt', 'Oratio')
    );

    expect(resolved).toEqual([]);
    expect(resolver.warnings.some((warning) => warning.type === 'missing-section')).toBe(true);
  });

  it('resolves preambles and merges sections with overlay precedence', async () => {
    const { resolver, cache } = await createResolver();

    const resolved = await resolver.resolveFile(await cache.get('preamble-overlay.txt'));
    const headers = resolved.sections.map((section) => section.header);

    expect(headers).toContain('__preamble');
    expect(headers).toEqual(expect.arrayContaining(['Officium', 'Rank', 'Oratio', 'Ant Vespera']));

    expect(
      resolved.sections
        .find((section) => section.header === 'Officium')
        ?.content.some(
          (line) => line.type === 'text' && line.value === 'Overlay Office Name'
        )
    ).toBe(true);

    expect(resolved.sections.find((section) => section.header === 'Rank')?.rank).toHaveLength(1);

    expect(resolved.sections.find((section) => section.header === 'Oratio')?.content).toEqual(
      expect.arrayContaining([
        { type: 'text', value: 'Deus, qui nos beati Petri glorificas.' },
        { type: 'formulaRef', name: 'Per Dominum' }
      ])
    );

    expect(resolved.sections.find((section) => section.header === 'Ant Vespera')?.content).toEqual([
      {
        type: 'psalmRef',
        psalmNumber: 109,
        antiphon: 'Ant. Sancti tui * benedicent tibi.'
      }
    ]);
  });

  it('supports section-only references in the current source file', async () => {
    const sectionOnlyFile = ['[Source]', '@:Target', '', '[Target]', 'Section-local text.'].join('\n');
    const { resolver, cache } = await createResolver({
      'section-only.txt': sectionOnlyFile
    });

    await cache.get('section-only.txt');

    const resolved = await resolver.resolve(
      parseCrossReference('@:Target'),
      baseContext('section-only.txt', 'Source')
    );

    expect(resolved).toEqual([{ type: 'text', value: 'Section-local text.' }]);
  });

  it('resolves section-only references with substitutions after a spaced delimiter', async () => {
    const sectionOnlyFile = [
      '[Source]',
      '@:Versum Nona: s/[\\,\\.] al.*/./ig',
      '',
      '[Versum Nona]',
      'V. Adjutórium nostrum in nómine Dómini, allelúja.',
      'R. Qui fecit cælum et terram, allelúja.'
    ].join('\n');
    const { resolver, cache } = await createResolver({
      'section-only-spaced-substitution.txt': sectionOnlyFile
    });

    await cache.get('section-only-spaced-substitution.txt');

    const resolved = await resolver.resolve(
      parseCrossReference('@:Versum Nona: s/[\\,\\.] al.*/./ig'),
      baseContext('section-only-spaced-substitution.txt', 'Source')
    );

    expect(resolved).toEqual([
      {
        type: 'verseMarker',
        marker: 'V.',
        text: 'Adjutórium nostrum in nómine Dómini.'
      },
      {
        type: 'verseMarker',
        marker: 'R.',
        text: 'Qui fecit cælum et terram.'
      }
    ]);
  });

  it('coalesces same-file duplicate text sections with header conditions', async () => {
    const { resolver, cache } = await createResolver({
      'duplicate-variants.txt': [
        '[Prayer]',
        'Base blessing.',
        '',
        '[Prayer] (rubrica specialis)',
        'Special blessing.'
      ].join('\n')
    });

    const resolved = await resolver.resolveFile(await cache.get('duplicate-variants.txt'));
    const sections = resolved.sections.filter((section) => section.header === 'Prayer');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.content).toEqual([
      {
        type: 'conditional',
        condition: {
          expression: {
            type: 'not',
            inner: { type: 'match', subject: 'rubrica', predicate: 'specialis' }
          }
        },
        content: [{ type: 'text', value: 'Base blessing.' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'rubrica', predicate: 'specialis' }
        },
        content: [{ type: 'text', value: 'Special blessing.' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ]);
  });

  it('coalesces duplicate referenced sections with header conditions', async () => {
    const { resolver } = await createResolver({
      'duplicate-reference-source.txt': [
        '[Caller]',
        '@duplicate-reference-target:Prayer',
        '',
        '[Prayer]',
        'Base blessing.',
        '',
        '[Prayer] (rubrica specialis)',
        'Special blessing.'
      ].join('\n'),
      'duplicate-reference-target.txt': [
        '[Prayer]',
        'Base blessing.',
        '',
        '[Prayer] (rubrica specialis)',
        'Special blessing.'
      ].join('\n')
    });

    const resolved = await resolver.resolve(
      parseCrossReference('@duplicate-reference-target:Prayer'),
      baseContext('duplicate-reference-source.txt', 'Caller')
    );

    expect(resolved).toEqual([
      {
        type: 'conditional',
        condition: {
          expression: {
            type: 'not',
            inner: { type: 'match', subject: 'rubrica', predicate: 'specialis' }
          }
        },
        content: [{ type: 'text', value: 'Base blessing.' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      },
      {
        type: 'conditional',
        condition: {
          expression: { type: 'match', subject: 'rubrica', predicate: 'specialis' }
        },
        content: [{ type: 'text', value: 'Special blessing.' }],
        scope: { backwardLines: 0, forwardMode: 'line' }
      }
    ]);
  });

  it('warns when duplicate referenced sections are unconditional', async () => {
    const { resolver } = await createResolver({
      'duplicate-unconditional-target.txt': [
        '[Prayer]',
        'First blessing.',
        '',
        '[Prayer]',
        'Second blessing.'
      ].join('\n')
    });

    const resolved = await resolver.resolve(
      parseCrossReference('@duplicate-unconditional-target:Prayer'),
      baseContext('reference-chain-a.txt', 'Oratio')
    );

    expect(extractText(resolved)).toEqual(['Second blessing.']);
    expect(
      resolver.warnings.some(
        (warning) =>
          warning.type === 'ambiguous-section' &&
          warning.reference === '@duplicate-unconditional-target:Prayer'
      )
    ).toBe(true);
  });

  it('keeps resolving when a referenced file is missing and records warnings', async () => {
    const directMissing = parseFile('[Oratio]\n@missing-file:Oratio', 'direct-missing.txt');
    const { resolver } = await createResolver({
      'direct-missing.txt': '[Oratio]\n@missing-file:Oratio'
    });

    const resolved = await resolver.resolveFile(directMissing);

    expect(resolved.sections.find((section) => section.header === 'Oratio')?.content).toEqual([]);
    expect(resolver.warnings.some((warning) => warning.type === 'missing-file')).toBe(true);
  });

  it('probes candidates without double-reading successful files', async () => {
    const { cache, loader } = await createResolver();
    const resolver = new CrossReferenceResolver(cache, {
      domain: 'horas',
      language: 'Latin',
      pathResolver: () => ['missing.txt', 'reference-chain-b.txt']
    });

    await resolver.resolve(
      parseCrossReference('@fallback-target:Oratio'),
      baseContext('reference-chain-a.txt', 'Oratio')
    );

    expect(loader.calls.filter((path) => path === 'missing.txt')).toHaveLength(1);
    expect(loader.calls.filter((path) => path === 'reference-chain-b.txt')).toHaveLength(1);
  });
});
