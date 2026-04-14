export interface CorpusFile {
  relativePath: string;
  language: string;
  domain: 'horas' | 'missa' | 'tabulae';
}

export interface CorpusWalker {
  walk(basePath: string): AsyncIterable<CorpusFile>;
}

export class UnimplementedCorpusWalker implements CorpusWalker {
  async *walk(_basePath: string): AsyncIterable<CorpusFile> {
    throw new Error('Corpus walker is not implemented in Phase 1 scaffold.');
  }
}
