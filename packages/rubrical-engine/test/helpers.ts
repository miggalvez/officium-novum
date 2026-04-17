import { parseFile, type ParsedFile } from '@officium-novum/parser';

import type { OfficeTextIndex } from '../src/index.js';

export class TestOfficeTextIndex implements OfficeTextIndex {
  private readonly files = new Map<string, ParsedFile>();

  add(path: string, content: string): void {
    this.files.set(path, parseFile(content, path));
  }

  getFile(path: string): ParsedFile | undefined {
    return this.files.get(path);
  }

  findByContentPath(contentPath: string): ParsedFile[] {
    const suffix = contentPath.endsWith('.txt') ? contentPath : `${contentPath}.txt`;
    return [...this.files.values()].filter((file) => file.path.endsWith(suffix));
  }
}
