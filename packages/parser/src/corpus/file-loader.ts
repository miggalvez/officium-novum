import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface FileLoader {
  load(relativePath: string): Promise<string>;
}

export class FsFileLoader implements FileLoader {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async load(relativePath: string): Promise<string> {
    const resolvedPath = resolve(join(this.basePath, relativePath));

    try {
      const content = await readFile(resolvedPath, 'utf8');
      return normalizeLineEndings(content);
    } catch (error) {
      if (isErrorWithCode(error, 'ENOENT')) {
        throw new Error(`Corpus file not found: ${resolvedPath}`, {
          cause: error
        });
      }

      throw error;
    }
  }
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/gu, '\n');
}

function isErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
