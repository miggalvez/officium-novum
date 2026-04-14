import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface CorpusFile {
  relativePath: string;
  language: string;
  domain: 'horas' | 'missa' | 'tabulae';
  contentDir: string;
  rite?: string;
}

export interface CorpusWalker {
  walk(basePath: string): AsyncIterable<CorpusFile>;
}

const DOMAIN_ORDER: Array<'horas' | 'missa'> = ['horas', 'missa'];
const CONTENT_PRIORITY = new Map<string, number>([
  ['CommuneOP', 0],
  ['CommuneM', 1],
  ['Sancti', 2]
]);
const LANGUAGE_PRIORITY = new Map<string, number>([
  ['Latin', 0],
  ['Latin-gabc', 1],
  ['English', 2],
  ['Ordinarium', 3]
]);
const TABULAE_CONTENT_DIRS = new Set(['Kalendaria', 'Transfer', 'Stransfer', 'Tempora']);
const MARTYROLOGIUM_VARIANT_REGEX = /^Martyrologium\d+[A-Za-z]*$/u;
const RITE_SUFFIXES: ReadonlyArray<{
  suffix: 'Cist' | 'OP' | 'M';
  rite: 'Cist' | 'OP' | 'M';
}> = [
  { suffix: 'Cist', rite: 'Cist' },
  { suffix: 'OP', rite: 'OP' },
  { suffix: 'M', rite: 'M' }
];
const RITE_CONTENT_DIR_BASES = new Set(['Tempora', 'Sancti', 'Commune']);

export class FsCorpusWalker implements CorpusWalker {
  async *walk(basePath: string): AsyncIterable<CorpusFile> {
    for (const domain of DOMAIN_ORDER) {
      yield* walkTextDomain(basePath, domain);
    }

    yield* walkTabulaeDomain(basePath);
  }
}

async function* walkTextDomain(
  basePath: string,
  domain: 'horas' | 'missa'
): AsyncIterable<CorpusFile> {
  const domainPath = join(basePath, domain);
  const entries = (await readDirectory(domainPath))
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !(domain === 'horas' && entry.name === 'Help'));
  const languageEntries = await filterLanguageDirectories(domainPath, domain, entries);

  for (const languageEntry of languageEntries.sort(compareByPriority(LANGUAGE_PRIORITY))) {
    if (domain === 'horas' && languageEntry.name === 'Ordinarium') {
      yield* walkContentDirectory(basePath, domain, 'Ordinarium', 'Ordinarium', join(domainPath, 'Ordinarium'));
      continue;
    }

    const language = languageEntry.name;
    const languagePath = join(domainPath, language);
    const contentDirectories = (await readDirectory(languagePath))
      .filter((entry) => entry.isDirectory())
      .sort(compareByPriority(CONTENT_PRIORITY));

    for (const contentDirectory of contentDirectories) {
      const contentPath = join(languagePath, contentDirectory.name);
      const parsedContent = parseContentDirectory(contentDirectory.name);
      yield* walkContentDirectory(
        basePath,
        domain,
        language,
        parsedContent.contentDir,
        contentPath,
        parsedContent.rite
      );
    }
  }
}

async function filterLanguageDirectories(
  domainPath: string,
  domain: 'horas' | 'missa',
  entries: Dirent<string>[]
): Promise<Dirent<string>[]> {
  const languages: Dirent<string>[] = [];

  for (const entry of entries) {
    if (domain === 'horas' && entry.name === 'Ordinarium') {
      languages.push(entry);
      continue;
    }

    const childEntries = await readDirectory(join(domainPath, entry.name));
    const hasContentDirectories = childEntries.some((child) => child.isDirectory());
    if (hasContentDirectories) {
      languages.push(entry);
    }
  }

  return languages;
}

async function* walkContentDirectory(
  basePath: string,
  domain: 'horas' | 'missa',
  language: string,
  contentDir: string,
  contentPath: string,
  rite?: 'M' | 'Cist' | 'OP'
): AsyncIterable<CorpusFile> {
  for await (const filePath of walkTxtFiles(contentPath)) {
    yield {
      relativePath: toPosixPath(relative(basePath, filePath)),
      language,
      domain,
      contentDir,
      rite
    };
  }
}

async function* walkTabulaeDomain(basePath: string): AsyncIterable<CorpusFile> {
  const tabulaePath = join(basePath, 'Tabulae');
  const contentDirectories = (await readDirectory(tabulaePath))
    .filter((entry) => entry.isDirectory() && TABULAE_CONTENT_DIRS.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const directory of contentDirectories) {
    const contentDir = directory.name;
    const directoryPath = join(tabulaePath, contentDir);

    for await (const filePath of walkTxtFiles(directoryPath)) {
      yield {
        relativePath: toPosixPath(relative(basePath, filePath)),
        language: '',
        domain: 'tabulae',
        contentDir
      };
    }
  }
}

async function* walkTxtFiles(directoryPath: string): AsyncIterable<string> {
  const entries = (await readDirectory(directoryPath))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      yield* walkTxtFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
      yield entryPath;
    }
  }
}

function parseContentDirectory(name: string): { contentDir: string; rite?: 'M' | 'Cist' | 'OP' } {
  if (name === 'Martyrologium' || MARTYROLOGIUM_VARIANT_REGEX.test(name)) {
    return { contentDir: 'Martyrologium' };
  }

  for (const { suffix, rite } of RITE_SUFFIXES) {
    if (!name.endsWith(suffix)) {
      continue;
    }

    const baseName = name.slice(0, -suffix.length);
    if (RITE_CONTENT_DIR_BASES.has(baseName)) {
      return {
        contentDir: baseName,
        rite
      };
    }
  }

  return { contentDir: name };
}

async function readDirectory(directoryPath: string): Promise<Dirent<string>[]> {
  try {
    return await readdir(directoryPath, { withFileTypes: true, encoding: 'utf8' });
  } catch (error) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return [];
    }

    throw error;
  }
}

function compareByPriority(priority: Map<string, number>) {
  return (left: { name: string }, right: { name: string }): number => {
    const leftPriority = priority.get(left.name) ?? Number.POSITIVE_INFINITY;
    const rightPriority = priority.get(right.name) ?? Number.POSITIVE_INFINITY;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.name.localeCompare(right.name);
  };
}

function toPosixPath(pathname: string): string {
  return pathname.replaceAll('\\', '/');
}

function isErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
