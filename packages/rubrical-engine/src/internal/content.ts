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
  const file = resolveOfficeFile(corpus, canonicalPath);
  const rankLine = selectRankLine(file, context);

  return {
    feastRef: {
      path: canonicalPath,
      id: canonicalPath,
      title: resolveTitle(file, rankLine, canonicalPath)
    },
    rawRank: rankLine.rank
  };
}

export function resolveOfficeFile(
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

function selectRankLine(
  file: ParsedFile,
  context: OfficeSelectionContext
): ParsedRankLine {
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

  const selected = override ?? fallback;
  if (!selected) {
    throw new Error(`No matching [Rank] line found in ${file.path}`);
  }

  return selected;
}

function resolveTitle(
  file: ParsedFile,
  rankLine: ParsedRankLine,
  canonicalPath: string
): string {
  const rankTitle = rankLine.title.trim();
  if (rankTitle) {
    return rankTitle;
  }

  const officio = file.sections.find((section) => section.header === 'Officium');
  const officioTitle = officio ? firstTextValue(officio.content) : undefined;
  if (officioTitle) {
    return officioTitle;
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
