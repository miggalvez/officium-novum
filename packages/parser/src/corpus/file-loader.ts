export interface FileLoader {
  load(relativePath: string): Promise<string>;
}

export class UnimplementedFileLoader implements FileLoader {
  async load(_relativePath: string): Promise<string> {
    throw new Error('Corpus file loading is not implemented in Phase 1 scaffold.');
  }
}
