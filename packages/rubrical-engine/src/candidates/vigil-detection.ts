import type { ParsedFile, TextContent } from '@officium-novum/parser';

import { addDays, normalizeDateInput } from '../internal/date.js';
import { resolveOfficeFile } from '../internal/content.js';
import type {
  Candidate,
  FeastReference,
  OfficeTextIndex
} from '../types/model.js';
import type { ResolvedVersion } from '../types/version.js';

// Rubricarum Instructum (1960) §93: only these vigils survive as liturgical entities.
const SURVIVING_1960_VIGILS = new Set([
  'Sancti/12-24', // Vigil of Christmas
  'Sancti/12-24s',
  'Sancti/12-24so',
  'Tempora/Quad6-6', // Easter Vigil
  'Tempora/Pasc5-3', // Vigil of Ascension
  'Tempora/Pasc6-6' // Vigil of Pentecost
]);

// Fixed vigil -> feast mappings used when title parsing alone is ambiguous in the corpus.
const HARDCODED_VIGIL_TARGETS = new Map<string, string>([
  ['Sancti/12-24', 'Sancti/12-25'],
  ['Sancti/12-24s', 'Sancti/12-25'],
  ['Sancti/12-24so', 'Sancti/12-25'],
  ['Sancti/01-05', 'Sancti/01-06'],
  ['Tempora/Quad6-6', 'Tempora/Pasc0-0'],
  ['Tempora/Pasc5-3', 'Tempora/Pasc6-4'],
  ['Tempora/Pasc6-6', 'Tempora/Pasc7-0']
]);

export interface DetectVigilParams {
  readonly candidate: Candidate;
  readonly version: ResolvedVersion;
  readonly corpus: OfficeTextIndex;
}

export function detectVigil(params: DetectVigilParams): FeastReference | null {
  if (params.version.policy.name === 'rubrics-1960') {
    if (!SURVIVING_1960_VIGILS.has(params.candidate.feastRef.path)) {
      return null;
    }
  }

  const file = tryResolveOfficeFile(params.corpus, params.candidate.feastRef.path);
  const hasVigilMarker = detectsVigilMarker(file, params.candidate.feastRef.title);
  const mappedPath = HARDCODED_VIGIL_TARGETS.get(params.candidate.feastRef.path);

  if (!hasVigilMarker && !mappedPath) {
    return null;
  }

  const inferredPath = mappedPath ?? inferSanctoralTargetPath(params.candidate.feastRef.path);
  if (!inferredPath) {
    return null;
  }

  if (!hasOfficeFile(params.corpus, inferredPath)) {
    return null;
  }

  return {
    path: inferredPath,
    id: inferredPath,
    title: resolveFeastTitle(params.corpus, inferredPath)
  };
}

function detectsVigilMarker(file: ParsedFile | null, fallbackTitle: string): boolean {
  const titles = [fallbackTitle, ...(file ? extractTitles(file) : [])];
  return titles.some((title) => isVigilTitle(title));
}

function isVigilTitle(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  return /^in\s+vigilia\s+/iu.test(normalized) || /^vigilia\s+/iu.test(normalized) || /\bvigilia\b/iu.test(normalized);
}

function extractTitles(file: ParsedFile): readonly string[] {
  const titles: string[] = [];

  for (const section of file.sections) {
    if (section.header === 'Rank' && section.rank) {
      for (const rankLine of section.rank) {
        if (rankLine.title.trim()) {
          titles.push(rankLine.title.trim());
        }
      }
    }

    if (section.header === 'Officium') {
      const title = firstTextValue(section.content);
      if (title) {
        titles.push(title);
      }
    }
  }

  return titles;
}

function firstTextValue(content: readonly TextContent[]): string | null {
  for (const entry of content) {
    if (entry.type === 'text') {
      const value = entry.value.trim();
      if (value) {
        return value;
      }
      continue;
    }

    if (entry.type === 'conditional') {
      const nested = firstTextValue(entry.content);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function inferSanctoralTargetPath(path: string): string | null {
  const match = /^(Sancti(?:M|Cist|OP)?)\/(\d{2})-(\d{2})/u.exec(path);
  if (!match) {
    return null;
  }

  const dir = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = addDays(normalizeDateInput({ year: 2001, month, day }), 1);
  const nextKey = `${next.month.toString().padStart(2, '0')}-${next.day.toString().padStart(2, '0')}`;
  return `${dir}/${nextKey}`;
}

function hasOfficeFile(corpus: OfficeTextIndex, canonicalPath: string): boolean {
  const directPath = `horas/Latin/${canonicalPath}.txt`;
  if (corpus.getFile(directPath)) {
    return true;
  }

  return corpus
    .findByContentPath(canonicalPath)
    .some((file) => file.path.startsWith('horas/Latin/'));
}

function resolveFeastTitle(corpus: OfficeTextIndex, canonicalPath: string): string {
  const file = tryResolveOfficeFile(corpus, canonicalPath);
  if (!file) {
    return canonicalPath.split('/').at(-1) ?? canonicalPath;
  }

  const rankTitle = file.sections
    .find((section) => section.header === 'Rank' && (section.rank?.length ?? 0) > 0)
    ?.rank?.find((line) => line.title.trim())?.title
    .trim();
  if (rankTitle) {
    return rankTitle;
  }

  const officioTitle = file.sections
    .find((section) => section.header === 'Officium')
    ?.content.map((item) => (item.type === 'text' ? item.value.trim() : ''))
    .find((item) => item.length > 0);
  if (officioTitle) {
    return officioTitle;
  }

  return canonicalPath.split('/').at(-1) ?? canonicalPath;
}

function tryResolveOfficeFile(corpus: OfficeTextIndex, canonicalPath: string): ParsedFile | null {
  try {
    return resolveOfficeFile(corpus, canonicalPath);
  } catch {
    return null;
  }
}
