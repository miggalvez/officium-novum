import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FsCorpusWalker, type CorpusFile } from '../../src/corpus/corpus-walker.js';
import { FsFileLoader } from '../../src/corpus/file-loader.js';
import { FileCache } from '../../src/resolver/file-cache.js';
import { CrossReferenceResolver } from '../../src/resolver/reference-resolver.js';
import type { TextContent } from '../../src/types/schema.js';
import type { ParsedFile } from '../../src/types/sections.js';
type TextCorpusFile = CorpusFile & { domain: 'horas' | 'missa' };

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PARSER_ROOT = resolve(TEST_DIR, '../..');
const UPSTREAM_ROOT = resolve(PARSER_ROOT, '../../upstream/web/www');
const HAS_UPSTREAM = existsSync(UPSTREAM_ROOT);
const describeIfUpstream = HAS_UPSTREAM ? describe : describe.skip;

const MIN_SPOT_CHECK_FILES = 50;
const TARGET_SPOT_CHECK_FILES = 60;
const FEAST_CONTENT_DIR_PRIORITY = ['Sancti', 'Tempora', 'Commune'] as const;
const FEAST_CONTENT_DIR_SET = new Set<string>(FEAST_CONTENT_DIR_PRIORITY);

describeIfUpstream('Phase 1 spot-check validation', () => {
  it(
    'spot-checks 50+ representative feast files across languages against resolved snapshots',
    async () => {
      const candidates = await collectRepresentativeFeastFiles(
        UPSTREAM_ROOT,
        TARGET_SPOT_CHECK_FILES
      );

      expect(candidates.length).toBeGreaterThanOrEqual(MIN_SPOT_CHECK_FILES);

      const cache = new FileCache(new FsFileLoader(UPSTREAM_ROOT));
      const resolverMap = new Map<string, CrossReferenceResolver>();
      const digests: SpotCheckDigest[] = [];
      const skipped: Array<{ path: string; reason: string }> = [];

      for (const entry of candidates) {
        if (digests.length >= TARGET_SPOT_CHECK_FILES) {
          break;
        }

        const resolver = getResolver(entry, cache, resolverMap);

        try {
          const warningStart = resolver.warnings.length;
          const resolved = await resolver.resolveFile(await cache.get(entry.relativePath));
          const warningCount = resolver.warnings.length - warningStart;
          resolver.warnings.length = warningStart;

          digests.push(buildDigest(entry, resolved, warningCount));
        } catch (error) {
          skipped.push({
            path: entry.relativePath,
            reason: error instanceof Error ? error.message : String(error)
          });
        }
      }

      expect(digests.length).toBeGreaterThanOrEqual(MIN_SPOT_CHECK_FILES);
      expect(new Set(digests.map((digest) => digest.language)).size).toBeGreaterThan(5);
      expect(digests.every((digest) => digest.hasReferenceNodes === false)).toBe(true);
      expect({
        digests,
        skippedCount: skipped.length,
        skippedPreview: skipped.slice(0, 10)
      }).toMatchSnapshot();
    },
    90_000
  );
});

async function collectRepresentativeFeastFiles(
  basePath: string,
  desiredCount: number
): Promise<TextCorpusFile[]> {
  const walker = new FsCorpusWalker();
  const candidates: TextCorpusFile[] = [];

  for await (const entry of walker.walk(basePath)) {
    if (!isTextDomain(entry.domain)) {
      continue;
    }

    if (!FEAST_CONTENT_DIR_SET.has(entry.contentDir)) {
      continue;
    }

    candidates.push(entry);
  }

  const byLanguage = groupByLanguage(candidates);
  const selected = new Map<string, TextCorpusFile>();

  for (const language of [...byLanguage.keys()].sort((left, right) => left.localeCompare(right))) {
    const entries = byLanguage.get(language) ?? [];

    for (const contentDir of FEAST_CONTENT_DIR_PRIORITY) {
      const candidate = entries.find((entry) => entry.contentDir === contentDir);
      if (candidate) {
        selected.set(candidate.relativePath, candidate);
      }
    }
  }

  const languageCoverageTarget = Math.max(MIN_SPOT_CHECK_FILES, byLanguage.size * 2);
  const targetCount = Math.max(desiredCount, languageCoverageTarget);

  for (const candidate of candidates) {
    if (selected.size >= targetCount && selected.has(candidate.relativePath)) {
      continue;
    }

    if (!selected.has(candidate.relativePath)) {
      selected.set(candidate.relativePath, candidate);
    }
  }

  return [...selected.values()];
}

function groupByLanguage(candidates: readonly TextCorpusFile[]): Map<string, TextCorpusFile[]> {
  const byLanguage = new Map<string, TextCorpusFile[]>();

  for (const entry of candidates) {
    const bucket = byLanguage.get(entry.language);
    if (bucket) {
      bucket.push(entry);
      continue;
    }

    byLanguage.set(entry.language, [entry]);
  }

  return byLanguage;
}

function getResolver(
  entry: TextCorpusFile,
  cache: FileCache,
  resolverMap: Map<string, CrossReferenceResolver>
): CrossReferenceResolver {
  const key = `${entry.domain}::${entry.language}::${entry.rite ?? ''}`;
  const existing = resolverMap.get(key);
  if (existing) {
    return existing;
  }

  const resolver = new CrossReferenceResolver(cache, {
    domain: entry.domain,
    language: entry.language,
    rite: entry.rite
  });

  resolverMap.set(key, resolver);
  return resolver;
}

function buildDigest(entry: TextCorpusFile, file: ParsedFile, warningCount: number): SpotCheckDigest {
  return {
    path: entry.relativePath,
    language: entry.language,
    domain: entry.domain,
    sectionCount: file.sections.length,
    hasReferenceNodes: file.sections.some((section) =>
      section.content.some((line) => line.type === 'reference')
    ),
    warningCount,
    samples: {
      Officium: summarizeSection(file, 'Officium'),
      Rank: summarizeRank(file),
      Rule: summarizeRules(file),
      Oratio: summarizeSection(file, 'Oratio'),
      Lectio1: summarizeSection(file, 'Lectio1'),
      Responsory1: summarizeSection(file, 'Responsory1'),
      'Ant Vespera': summarizeSection(file, 'Ant Vespera')
    }
  };
}

function summarizeSection(file: ParsedFile, sectionName: string): string[] {
  const section = file.sections.find((candidate) => candidate.header === sectionName);
  if (!section) {
    return [];
  }

  const lines = section.content
    .map(renderContentLine)
    .map(normalizeSnapshotLine)
    .filter((line) => line.length > 0);

  return lines.slice(0, 2);
}

function summarizeRank(file: ParsedFile): string[] {
  const section = file.sections.find((candidate) => candidate.header === 'Rank');
  if (!section?.rank || section.rank.length === 0) {
    return [];
  }

  return section.rank
    .slice(0, 2)
    .map((line) => `${line.title}|${line.rank.name}|${line.rank.classWeight}|${line.rank.derivation ?? ''}`)
    .map(normalizeSnapshotLine);
}

function summarizeRules(file: ParsedFile): string[] {
  const section = file.sections.find((candidate) => candidate.header === 'Rule');
  if (!section?.rules || section.rules.length === 0) {
    return [];
  }

  return section.rules.slice(0, 2).map((rule) => normalizeSnapshotLine(rule.raw));
}

function renderContentLine(line: TextContent): string {
  switch (line.type) {
    case 'text':
      return line.value;
    case 'verseMarker':
      return `${line.marker} ${line.text}`;
    case 'formulaRef':
      return `$${line.name}`;
    case 'macroRef':
      return `&${line.name}`;
    case 'psalmInclude':
      return `&psalm(${line.psalmNumber})`;
    case 'psalmRef':
      return `${line.antiphon ?? ''};;${line.psalmNumber}${line.tone ? `;;${line.tone}` : ''}`;
    case 'citation':
    case 'rubric':
      return `!${line.value}`;
    case 'heading':
      return `#${line.value}`;
    case 'separator':
      return '_';
    case 'reference':
      return '@reference';
    case 'conditional':
      return `conditional:${line.scope}`;
    case 'gabcNotation':
      return 'gabc';
    default:
      return '';
  }
}

function normalizeSnapshotLine(line: string): string {
  return line.replace(/\s+/gu, ' ').trim();
}

function isTextDomain(domain: CorpusFile['domain']): domain is 'horas' | 'missa' {
  return domain === 'horas' || domain === 'missa';
}

interface SpotCheckDigest {
  path: string;
  language: string;
  domain: 'horas' | 'missa';
  sectionCount: number;
  hasReferenceNodes: boolean;
  warningCount: number;
  samples: Record<string, string[]>;
}
