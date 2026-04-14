import type { ParsedFile, ParsedSection } from '../types/sections.js';
import { ensureTxtSuffix, normalizeRelativePath } from '../utils/path.js';

export interface TextIndex {
  addFile(file: ParsedFile): void;
  getFile(path: string): ParsedFile | undefined;
  getSection(path: string, sectionName: string): ParsedSection | undefined;
  findByContentPath(contentPath: string): ParsedFile[];
  readonly size: number;
}

export class InMemoryTextIndex implements TextIndex {
  private readonly files = new Map<string, ParsedFile>();

  addFile(file: ParsedFile): void {
    const key = normalizeRelativePath(file.path);
    this.files.set(key, file);
  }

  getFile(path: string): ParsedFile | undefined {
    const key = normalizeRelativePath(path);
    return this.files.get(key);
  }

  getSection(path: string, sectionName: string): ParsedSection | undefined {
    const file = this.getFile(path);
    return file?.sections.find((section) => section.header === sectionName);
  }

  findByContentPath(contentPath: string): ParsedFile[] {
    const suffix = ensureTxtSuffix(normalizeRelativePath(contentPath));
    const matches: ParsedFile[] = [];

    for (const [path, file] of this.files.entries()) {
      if (path.endsWith(suffix)) {
        matches.push(file);
      }
    }

    return matches;
  }

  get size(): number {
    return this.files.size;
  }
}
