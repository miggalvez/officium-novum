import type { ParsedFile, ParsedRankLine, TextContent } from '@officium-novum/parser';

import type {
  FeastReference,
  LiturgicalSeason,
  OfficeTextIndex
} from '../types/model.js';
import type { ResolvedVersion } from '../types/version.js';

import { conditionMatches } from './conditions.js';
import type { CalendarDate } from './date.js';

export interface OfficeSelectionContext {
  readonly date: CalendarDate;
  readonly dayOfWeek: number;
  readonly season?: LiturgicalSeason;
  readonly version: ResolvedVersion;
}

export interface OfficeDefinition {
  readonly feastRef: FeastReference;
  readonly rawRank: ParsedRankLine['rank'];
}

export function canonicalContentDir(
  base: 'Tempora' | 'Sancti',
  version: ResolvedVersion
): string {
  switch (version.policy.name) {
    case 'monastic-tridentine':
    case 'monastic-divino':
    case 'monastic-1963':
      return `${base}M`;
    case 'cistercian-1951':
    case 'cistercian-altovadense':
      return `${base}Cist`;
    case 'dominican-1962':
      return `${base}OP`;
    default:
      return base;
  }
}

export function resolveOfficeDefinition(
  corpus: OfficeTextIndex,
  canonicalPath: string,
  context: OfficeSelectionContext
): OfficeDefinition {
  const selection = resolveOfficeSelection(corpus, canonicalPath, context.version);
  const metadata = selectOfficeMetadata(selection.files, selection.canonicalPath, context);

  return {
    feastRef: {
      path: selection.canonicalPath,
      id: selection.canonicalPath,
      title: metadata.title
    },
    rawRank: metadata.rankLine.rank
  };
}

export function resolveOfficeFile(
  corpus: OfficeTextIndex,
  canonicalPath: string
): ParsedFile {
  const cached = getCachedResolvedOfficeFile(corpus, canonicalPath);
  if (cached) {
    return cached;
  }

  const resolved = mergePreambleOfficeFile(corpus, resolveRawOfficeFile(corpus, canonicalPath));
  cacheResolvedOfficeFile(corpus, canonicalPath, resolved);
  return resolved;
}

export function resolveRawOfficeFile(
  corpus: OfficeTextIndex,
  canonicalPath: string
): ParsedFile {
  const directPath = `horas/Latin/${canonicalPath}.txt`;
  const direct = corpus.getFile(directPath);
  if (direct) {
    return direct;
  }

  const fallback = corpus
    .findByContentPath(canonicalPath)
    .find((file: ParsedFile) => file.path.startsWith('horas/Latin/'));

  if (fallback) {
    return fallback;
  }

  throw new Error(`Corpus file not found for office path: ${canonicalPath}`);
}

const RESOLVED_OFFICE_FILE_CACHE = new WeakMap<
  OfficeTextIndex,
  Map<string, ParsedFile>
>();

function getCachedResolvedOfficeFile(
  corpus: OfficeTextIndex,
  canonicalPath: string
): ParsedFile | undefined {
  return RESOLVED_OFFICE_FILE_CACHE.get(corpus)?.get(canonicalPath);
}

function cacheResolvedOfficeFile(
  corpus: OfficeTextIndex,
  canonicalPath: string,
  file: ParsedFile
): void {
  let corpusCache = RESOLVED_OFFICE_FILE_CACHE.get(corpus);
  if (!corpusCache) {
    corpusCache = new Map<string, ParsedFile>();
    RESOLVED_OFFICE_FILE_CACHE.set(corpus, corpusCache);
  }

  corpusCache.set(canonicalPath, file);
}

function mergePreambleOfficeFile(
  corpus: OfficeTextIndex,
  file: ParsedFile,
  visited = new Set<string>()
): ParsedFile {
  if (visited.has(file.path)) {
    return {
      path: file.path,
      sections: file.sections
        .filter((section) => section.header !== '__preamble')
        .map(cloneParsedSection)
    };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(file.path);

  const mergedSections = new Map<string, ParsedFile['sections'][number]>();
  for (const referencePath of preambleReferencePaths(file)) {
    try {
      const mergedReference = mergePreambleOfficeFile(
        corpus,
        resolveRawOfficeFile(corpus, referencePath),
        nextVisited
      );
      for (const section of mergedReference.sections) {
        if (!mergedSections.has(section.header)) {
          mergedSections.set(section.header, cloneParsedSection(section));
        }
      }
    } catch {
      continue;
    }
  }

  for (const section of file.sections) {
    if (section.header === '__preamble') {
      continue;
    }

    mergedSections.set(section.header, cloneParsedSection(section));
  }

  return {
    path: file.path,
    sections: [...mergedSections.values()]
  };
}

function preambleReferencePaths(file: ParsedFile): readonly string[] {
  return file.sections
    .filter((section) => section.header === '__preamble')
    .flatMap((section) => section.content)
    .flatMap((entry) => {
      if (entry.type !== 'reference' || !entry.ref.path) {
        return [];
      }

      return [entry.ref.path];
    });
}

function cloneParsedSection(section: ParsedFile['sections'][number]): ParsedFile['sections'][number] {
  return structuredClone(section);
}

function resolveOfficeSelection(
  corpus: OfficeTextIndex,
  canonicalPath: string,
  version: ResolvedVersion
): { readonly files: readonly ParsedFile[]; readonly canonicalPath: string } {
  const matches: Array<{ readonly file: ParsedFile; readonly canonicalPath: string }> = [];

  for (const candidatePath of officePathCandidates(canonicalPath, version)) {
    const directPath = `horas/Latin/${candidatePath}.txt`;
    const direct = corpus.getFile(directPath);
    if (direct) {
      matches.push({
        file: direct,
        canonicalPath: candidatePath
      });
      continue;
    }

    const fallback = corpus
      .findByContentPath(candidatePath)
      .find((file: ParsedFile) => file.path.startsWith('horas/Latin/'));

    if (fallback) {
      matches.push({
        file: fallback,
        canonicalPath: candidatePath
      });
    }
  }

  if (matches.length > 0) {
    return {
      files: matches.map((match) => match.file),
      canonicalPath: matches[0]!.canonicalPath
    };
  }

  throw new Error(`Corpus file not found for office path: ${canonicalPath}`);
}

function officePathCandidates(
  canonicalPath: string,
  version: ResolvedVersion
): readonly string[] {
  if (
    canonicalPath.startsWith('Tempora/') &&
    !canonicalPath.endsWith('r') &&
    temporalRVariantBasePaths(version.kalendar).has(canonicalPath)
  ) {
    return [`${canonicalPath}r`, canonicalPath];
  }

  return [canonicalPath];
}

function temporalRVariantBasePaths(kalendar: string): ReadonlySet<string> {
  switch (kalendar) {
    case '1955':
      return TEMPORA_R_VARIANTS_1955;
    case '1960':
      return TEMPORA_R_VARIANTS_1960;
    case 'NC':
      return TEMPORA_R_VARIANTS_NEWCAL;
    default:
      return NO_TEMPORA_R_VARIANTS;
  }
}

const NO_TEMPORA_R_VARIANTS = new Set<string>();

const TEMPORA_R_VARIANTS_1955 = new Set([
  'Tempora/Quad6-0',
  'Tempora/Quad6-4',
  'Tempora/Quad6-5',
  'Tempora/Quad6-6',
  'Tempora/Pent01-0'
]);

const TEMPORA_R_VARIANTS_1960 = new Set([
  'Tempora/Quad6-0',
  'Tempora/Quad6-4',
  'Tempora/Quad6-5',
  'Tempora/Quad6-6',
  'Tempora/Pasc3-0',
  'Tempora/Pasc5-1',
  'Tempora/Pasc6-4',
  'Tempora/Pasc6-6',
  'Tempora/Pent01-0',
  'Tempora/Pent02-0',
  'Tempora/Pent03-0'
]);

const TEMPORA_R_VARIANTS_NEWCAL = new Set([
  'Tempora/Quad6-0',
  'Tempora/Quad6-4',
  'Tempora/Quad6-5',
  'Tempora/Quad6-6',
  'Tempora/Pasc3-0',
  'Tempora/Pasc5-1',
  'Tempora/Pasc6-4',
  'Tempora/Pent01-0',
  'Tempora/Pent02-0',
  'Tempora/Pent03-0'
]);

function trySelectRankLine(
  file: ParsedFile,
  context: OfficeSelectionContext
): ParsedRankLine | undefined {
  let fallback: ParsedRankLine | undefined;
  let override: ParsedRankLine | undefined;

  for (const section of file.sections) {
    if (section.header !== 'Rank' || !section.rank) {
      continue;
    }

    for (const line of section.rank) {
      if (
        !conditionMatches(line.rank.condition, {
          date: context.date,
          dayOfWeek: context.dayOfWeek,
          season: context.season,
          version: context.version
        })
      ) {
        continue;
      }

      if (line.rank.condition) {
        override = line;
      } else if (!fallback) {
        fallback = line;
      }
    }
  }

  return override ?? fallback;
}

function selectOfficeMetadata(
  files: readonly ParsedFile[],
  canonicalPath: string,
  context: OfficeSelectionContext
): {
  readonly rankLine: ParsedRankLine;
  readonly title: string;
} {
  for (const file of files) {
    const rankLine = trySelectRankLine(file, context);
    if (!rankLine) {
      continue;
    }

    return {
      rankLine,
      title: resolveTitle(files, rankLine, canonicalPath)
    };
  }

  throw new Error(`No matching [Rank] line found in ${files[0]?.path ?? canonicalPath}`);
}

function resolveTitle(
  files: readonly ParsedFile[],
  rankLine: ParsedRankLine,
  canonicalPath: string
): string {
  const rankTitle = rankLine.title.trim();
  if (rankTitle) {
    return rankTitle;
  }

  for (const file of files) {
    const officio = file.sections.find((section) => section.header === 'Officium');
    const officioTitle = officio ? firstTextValue(officio.content) : undefined;
    if (officioTitle) {
      return officioTitle;
    }
  }

  return canonicalPath.split('/').at(-1) ?? canonicalPath;
}

function firstTextValue(content: readonly TextContent[]): string | undefined {
  for (const entry of content) {
    if (entry.type === 'text') {
      const trimmed = entry.value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (entry.type === 'conditional') {
      const nested = firstTextValue(entry.content);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}
