import type { FileLoader } from '../corpus/file-loader.js';
import { parseRawSections } from '../parser/parse-file.js';
import { splitSections } from '../parser/section-splitter.js';
import type { ParsedFile, RawSection } from '../types/sections.js';
import { normalizeRelativePath } from '../utils/path.js';

export interface CachedFile {
  parsed: ParsedFile;
  raw: RawSection[];
}

export class FileCache {
  private readonly loader: FileLoader;
  private readonly cache = new Map<string, CachedFile>();
  private readonly knownMissing = new Set<string>();
  private readonly knownExisting = new Set<string>();

  constructor(loader: FileLoader) {
    this.loader = loader;
  }

  async get(relativePath: string): Promise<ParsedFile> {
    const entry = await this.getCached(relativePath);
    return entry.parsed;
  }

  async has(relativePath: string): Promise<boolean> {
    const key = normalizeRelativePath(relativePath);

    if (this.cache.has(key)) {
      return true;
    }

    if (this.knownMissing.has(key)) {
      return false;
    }

    if (this.knownExisting.has(key)) {
      return true;
    }

    try {
      await this.loader.load(key);
      this.knownExisting.add(key);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        this.knownMissing.add(key);
        this.knownExisting.delete(key);
        return false;
      }

      throw error;
    }
  }

  *entries(): Iterable<[string, ParsedFile]> {
    for (const [path, entry] of this.cache.entries()) {
      yield [path, entry.parsed];
    }
  }

  async getCached(relativePath: string): Promise<CachedFile> {
    const key = normalizeRelativePath(relativePath);
    const existing = this.cache.get(key);
    if (existing) {
      return existing;
    }

    let content: string;

    try {
      content = await this.loader.load(key);
    } catch (error) {
      if (isNotFoundError(error)) {
        this.knownMissing.add(key);
        this.knownExisting.delete(key);
        throw new Error(`Corpus file not found: ${key}`, { cause: error });
      }

      throw error;
    }

    this.knownExisting.add(key);
    this.knownMissing.delete(key);

    const raw = splitSections(content);
    const parsed: ParsedFile = {
      path: key,
      sections: parseRawSections(raw)
    };
    const entry: CachedFile = { parsed, raw };

    this.cache.set(key, entry);
    return entry;
  }

  async getRawSections(relativePath: string): Promise<RawSection[]> {
    const entry = await this.getCached(relativePath);
    return entry.raw;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError.code === 'ENOENT') {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeErr = cause as NodeJS.ErrnoException;
    if (causeErr.code === 'ENOENT') {
      return true;
    }
  }

  return /not found/iu.test(error.message);
}
