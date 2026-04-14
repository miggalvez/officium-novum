import { FileCache } from '../resolver/file-cache.js';
import { CrossReferenceResolver, type ResolverWarning } from '../resolver/reference-resolver.js';
import { InMemoryTextIndex, type TextIndex } from '../text-index/index.js';
import { FsCorpusWalker, type CorpusFile } from './corpus-walker.js';
import { FsFileLoader } from './file-loader.js';
type TextCorpusFile = CorpusFile & { domain: 'horas' | 'missa' };

export interface CorpusLoadResult {
  index: TextIndex;
  fileCount: number;
  errors: CorpusLoadError[];
  warningCount: number;
  warnings?: ResolverWarning[];
}

export interface CorpusLoadError {
  path: string;
  error: Error;
}

export interface CorpusLoadOptions {
  resolveReferences?: boolean;
  langfb?: string;
  maxDepth?: number;
  collectWarnings?: boolean;
}

export async function loadCorpus(
  basePath: string,
  options: CorpusLoadOptions = {}
): Promise<CorpusLoadResult> {
  const walker = new FsCorpusWalker();
  const fileCache = new FileCache(new FsFileLoader(basePath));
  const index = new InMemoryTextIndex();
  const errors: CorpusLoadError[] = [];
  const warnings: ResolverWarning[] = [];
  const resolverMap = new Map<string, CrossReferenceResolver>();
  const resolveReferences = options.resolveReferences ?? true;
  const collectWarnings = options.collectWarnings ?? false;
  let warningCount = 0;
  let fileCount = 0;

  for await (const entry of walker.walk(basePath)) {
    const path = entry.relativePath;
    fileCount += 1;

    try {
      const parsed = await fileCache.get(path);

      if (!resolveReferences || !isTextDomain(entry.domain)) {
        index.addFile(parsed);
        continue;
      }

      const textEntry = entry as TextCorpusFile;
      const resolver = getResolverForEntry(textEntry, fileCache, resolverMap, options);
      const warningStart = resolver.warnings.length;

      try {
        const resolved = await resolver.resolveFile(parsed);
        index.addFile(resolved);
      } catch (error) {
        errors.push({
          path,
          error: asError(error)
        });

        // Preserve availability even when reference resolution fails unexpectedly.
        index.addFile(parsed);
      }

      const newWarnings = resolver.warnings.slice(warningStart);
      warningCount += newWarnings.length;

      if (collectWarnings) {
        warnings.push(...newWarnings);
      }

      // Keep resolver warning buffers bounded during full-corpus loads.
      resolver.warnings.length = warningStart;
    } catch (error) {
      errors.push({
        path,
        error: asError(error)
      });
    }
  }

  return {
    index,
    fileCount,
    errors,
    warningCount,
    warnings: collectWarnings ? warnings : undefined
  };
}

function getResolverForEntry(
  entry: TextCorpusFile,
  cache: FileCache,
  resolverMap: Map<string, CrossReferenceResolver>,
  options: CorpusLoadOptions
): CrossReferenceResolver {
  const key = `${entry.domain}::${entry.language}::${entry.rite ?? ''}`;
  const existing = resolverMap.get(key);
  if (existing) {
    return existing;
  }

  const resolver = new CrossReferenceResolver(cache, {
    domain: entry.domain,
    language: entry.language,
    rite: entry.rite,
    langfb: options.langfb,
    maxDepth: options.maxDepth
  });

  resolverMap.set(key, resolver);
  return resolver;
}

function isTextDomain(domain: CorpusFile['domain']): domain is 'horas' | 'missa' {
  return domain === 'horas' || domain === 'missa';
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
