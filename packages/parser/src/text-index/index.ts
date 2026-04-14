import type { TextBlock } from '../types/schema.js';

export interface TextIndex {
  add(block: TextBlock): void;
  get(section: string, sourceFile?: string): TextBlock[];
}

export class InMemoryTextIndex implements TextIndex {
  add(_block: TextBlock): void {
    throw new Error('Text index is not implemented in Phase 1 scaffold.');
  }

  get(_section: string, _sourceFile?: string): TextBlock[] {
    throw new Error('Text index is not implemented in Phase 1 scaffold.');
  }
}
